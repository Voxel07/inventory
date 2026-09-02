package org.ash.inventory.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.domain.DomainEnums;
import org.ash.inventory.security.ActorService;
import org.ash.inventory.service.InventoryOperationsService;
import org.ash.inventory.service.OrderService;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Path("/api/sync")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class SyncResource {
    @Inject ObjectMapper objectMapper;
    @Inject OrderService orders;
    @Inject InventoryOperationsService inventory;
    @Inject ApiMapper mapper;
    @Inject ActorService actors;

    @POST
    public Object sync(@Valid ApiModels.SyncBatch batch) {
        actors.current();
        var results = new ArrayList<Map<String, Object>>();
        for (var action : batch.actions()) {
            var result = new LinkedHashMap<String, Object>();
            result.put("idempotencyKey", action.idempotencyKey());
            try {
                result.put("entity", execute(action));
                result.put("status", "applied");
            } catch (ApiException exception) {
                result.put("status", exception.status == 409 ? "conflict" : "rejected");
                result.put("error", exception.getMessage());
            } catch (RuntimeException exception) {
                result.put("status", "rejected");
                result.put("error", exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
            }
            results.add(result);
        }
        return Map.of("results", results);
    }

    private Object execute(ApiModels.SyncAction action) {
        return switch (action.type()) {
            case "transaction" -> {
                var value = objectMapper.convertValue(action.payload(), ApiModels.TransactionInput.class);
                var input = new ApiModels.TransactionInput(value.itemId(), value.transactionType(), value.quantityChanged(),
                        value.reason(), value.notes(), value.userId(), value.factionOrderId(), action.idempotencyKey());
                yield mapper.transaction(inventory.transact(input));
            }
            case "order.prepare" -> {
                UUID orderId = uuid(action.payload(), "orderId");
                var value = objectMapper.convertValue(action.payload().get("input"), ApiModels.PreparationInput.class);
                yield mapper.order(orders.prepare(orderId, new ApiModels.PreparationInput(value.preparedQuantities(), value.acknowledgeShortages(), action.idempotencyKey(), value.notes())));
            }
            case "order.transition" -> {
                UUID orderId = uuid(action.payload(), "orderId");
                var target = DomainEnums.OrderStatus.valueOf(action.payload().get("status").toString());
                yield mapper.order(orders.transition(orderId, target, new ApiModels.TransitionInput(action.idempotencyKey(), text(action.payload(), "notes"), text(action.payload(), "collectorName"))));
            }
            case "order.return" -> {
                UUID orderId = uuid(action.payload(), "orderId");
                var value = objectMapper.convertValue(action.payload().get("input"), ApiModels.ReturnInput.class);
                yield mapper.order(orders.returnItems(orderId, new ApiModels.ReturnInput(value.lines(), action.idempotencyKey(), value.notes())));
            }
            case "damage.create" -> {
                var value = objectMapper.convertValue(action.payload(), ApiModels.DamageInput.class);
                yield mapper.damage(inventory.createDamage(new ApiModels.DamageInput(value.itemId(), value.amount(), value.description(), value.severity(), value.factionOrderId(), action.idempotencyKey())));
            }
            default -> throw ApiException.badRequest("Unsupported offline action type: " + action.type());
        };
    }

    private UUID uuid(Map<String, Object> payload, String key) { return UUID.fromString(payload.get(key).toString()); }
    private String text(Map<String, Object> payload, String key) { Object value = payload.get(key); return value == null ? null : value.toString(); }
}
