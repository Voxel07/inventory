package org.ash.inventory.resource;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.InventoryOperationsService;
import org.ash.inventory.service.OrderService;
import org.ash.inventory.service.SyncAuditService;

import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;

@Path("/api/sync")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class SyncResource {
    private final ObjectMapper objectMapper;
    private final OrderService orders;
    private final InventoryOperationsService inventory;
    private final ApiMapper mapper;
    private final ActorService actors;
    private final SyncAuditService audits;

    public SyncResource(ObjectMapper objectMapper, OrderService orders, InventoryOperationsService inventory,
            ApiMapper mapper, ActorService actors, SyncAuditService audits) {
        this.objectMapper = objectMapper;
        this.orders = orders;
        this.inventory = inventory;
        this.mapper = mapper;
        this.actors = actors;
        this.audits = audits;
    }

    @POST
    public ApiResponses.SyncBatchResponse sync(@Valid ApiModels.SyncBatch batch) {
        var actor = actors.current();
        var results = new ArrayList<ApiResponses.SyncActionResponse>();
        for (var action : batch.actions()) {
            var previous = audits.existing(action.idempotencyKey());
            if (previous != null && "applied".equals(previous.syncStatus)) {
                results.add(new ApiResponses.SyncActionResponse(action.idempotencyKey(), "applied",
                        previous.serverResult, null));
                continue;
            }
            try {
                Object entity = QuarkusTransaction.requiringNew().call(() -> execute(action));
                audits.record(action, actor.id, "applied", entity, null);
                results.add(new ApiResponses.SyncActionResponse(
                        action.idempotencyKey(), "applied", entity, null));
            } catch (ApiException exception) {
                String status = exception.status == 409 ? "conflict" : "rejected";
                audits.record(action, actor.id, status, null, exception.getMessage());
                results.add(new ApiResponses.SyncActionResponse(
                        action.idempotencyKey(), status, null,
                        exception.getMessage()));
            } catch (RuntimeException exception) {
                String message = exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
                audits.record(action, actor.id, "rejected", null, message);
                results.add(new ApiResponses.SyncActionResponse(
                        action.idempotencyKey(), "rejected", null,
                        message));
            }
        }
        return new ApiResponses.SyncBatchResponse(results);
    }

    @GET
    @Path("/audit")
    public java.util.List<ApiResponses.SyncAuditResponse> audit(
            @QueryParam("status") String status,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        actors.requireAdmin();
        return audits.list(status, page, size).stream().map(mapper::syncAudit).toList();
    }

    private Object execute(ApiModels.SyncAction action) {
        return switch (action.type()) {
            case "order.create" -> {
                actors.current();
                var value = objectMapper.convertValue(action.payload(), ApiModels.OrderInput.class);
                yield mapper.order(orders.create(new ApiModels.OrderInput(
                        value.eventType(), value.faction(), value.eventDate(), value.eventOccurrenceId(), value.factionId(),
                        value.requestedPickupDate(), value.pickupLocation(), value.pickupLatitude(), value.pickupLongitude(),
                        value.collectorName(), value.notes(), value.requestedQuantities(),
                        value.requestedAssemblyQuantities(), action.idempotencyKey())));
            }
            case "transaction" -> {
                actors.requireWarehouse();
                var value = objectMapper.convertValue(action.payload(), ApiModels.TransactionInput.class);
                var input = new ApiModels.TransactionInput(value.itemId(), value.transactionType(), value.quantityChanged(),
                        value.reason(), value.notes(), value.eventType(), value.faction(), value.assetInstanceId(), value.userId(),
                        value.factionOrderId(), action.idempotencyKey());
                yield mapper.transaction(inventory.transact(input));
            }
            case "order.prepare" -> {
                actors.requireWarehouse();
                UUID orderId = uuid(action.payload(), "orderId");
                var value = objectMapper.convertValue(action.payload().get("input"), ApiModels.PreparationInput.class);
                yield mapper.order(orders.prepare(orderId, new ApiModels.PreparationInput(value.preparedQuantities(),
                        value.assetAssignments(), value.acknowledgeShortages(), action.idempotencyKey(), value.notes())));
            }
            case "order.transition" -> {
                UUID orderId = uuid(action.payload(), "orderId");
                var target = DomainEnums.OrderStatus.valueOf(action.payload().get("status").toString());
                if (target == DomainEnums.OrderStatus.submitted || target == DomainEnums.OrderStatus.draft) actors.current();
                else if (target == DomainEnums.OrderStatus.picked_up || target == DomainEnums.OrderStatus.closed)
                    actors.requireMarshal();
                else if (target == DomainEnums.OrderStatus.ready || target == DomainEnums.OrderStatus.preparing)
                    actors.requireWarehouse();
                else actors.requirePlanner();
                var value = objectMapper.convertValue(action.payload(), ApiModels.TransitionInput.class);
                yield mapper.order(orders.transition(orderId, target, new ApiModels.TransitionInput(
                        action.idempotencyKey(), value.notes(), value.collectorName(), value.pickupLocation(),
                        value.pickupLatitude(), value.pickupLongitude())));
            }
            case "order.return" -> {
                actors.requireMarshal();
                UUID orderId = uuid(action.payload(), "orderId");
                var value = objectMapper.convertValue(action.payload().get("input"), ApiModels.ReturnInput.class);
                yield mapper.order(orders.returnItems(orderId,
                        new ApiModels.ReturnInput(value.lines(), value.assets(), action.idempotencyKey(), value.notes())));
            }
            case "damage.create" -> {
                actors.requireMarshal();
                var value = objectMapper.convertValue(action.payload(), ApiModels.DamageInput.class);
                yield mapper.damage(inventory.createDamage(new ApiModels.DamageInput(
                        value.itemId(), value.amount(), value.description(), value.severity(), value.factionOrderId(),
                        action.idempotencyKey(), value.assetInstanceId(), value.handoverId(), value.safetyImpact())));
            }
            default -> throw ApiException.badRequest("Unsupported offline action type: " + action.type());
        };
    }

    private UUID uuid(Map<String, Object> payload, String key) { return UUID.fromString(payload.get(key).toString()); }
}
