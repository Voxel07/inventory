package org.ash.inventory.service;

import org.ash.inventory.resource.*;
import jakarta.enterprise.context.ApplicationScoped;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.validation.Valid;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.resource.dto.ApiResponses;

import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class SyncService {
    @jakarta.inject.Inject org.ash.inventory.orm.SyncAuditOrm orm;
    @jakarta.inject.Inject org.ash.inventory.service.ApiQueryService queries;
    @jakarta.inject.Inject jakarta.validation.Validator validator;
    private final ObjectMapper objectMapper;
    private final OrderService orders;
    private final InventoryOperationsService inventory;
    private final ApiMapper mapper;
    private final ActorService actors;
    private final SyncAuditService audits;

    public SyncService(ObjectMapper objectMapper, OrderService orders, InventoryOperationsService inventory,
            ApiMapper mapper, ActorService actors, SyncAuditService audits) {
        this.objectMapper = objectMapper;
        this.orders = orders;
        this.inventory = inventory;
        this.mapper = mapper;
        this.actors = actors;
        this.audits = audits;
    }


    public ApiResponses.SyncBatchResponse sync(@Valid ApiModels.SyncBatch batch) {
        var actor = actors.current();
        var results = new ArrayList<ApiResponses.SyncActionResponse>();
        for (var action : batch.actions()) {
            var previous = audits.existing(action.idempotencyKey());
            if (previous != null && (!previous.user.id.equals(actor.id)
                    || !previous.operationType.equals(action.type()) || !objectMapper.valueToTree(previous.payload).equals(objectMapper.valueToTree(action.payload())))) {
                results.add(new ApiResponses.SyncActionResponse(action.idempotencyKey(), "rejected", null, "Command ID belongs to a different actor or payload; create a correction with a new ID"));
                continue;
            }
            if (action.supersedes() != null) {
                var original = audits.existing(action.supersedes());
                if (original == null || !original.user.id.equals(actor.id) || "applied".equals(original.syncStatus)
                        || !original.operationType.equals(action.type()) || action.resolutionNote() == null || action.resolutionNote().isBlank()
                        || action.resolutionNote().length() > 2000 || action.supersedes().equals(action.idempotencyKey())) {
                    results.add(new ApiResponses.SyncActionResponse(action.idempotencyKey(), "rejected", null, "Correction requires your failed command and a resolution note"));
                    continue;
                }
            }
            if (previous != null) {
                results.add(new ApiResponses.SyncActionResponse(action.idempotencyKey(), previous.syncStatus,
                        previous.serverResult, previous.conflictMessage));
                continue;
            }
            try {
                Object entity = QuarkusTransaction.requiringNew().call(() -> {
                    orm.lockActor(actor.id);
                    var repeated = orm.find(action.idempotencyKey());
                    if (repeated != null) {
                        if (!repeated.user.id.equals(actor.id) || !repeated.operationType.equals(action.type())
                                || !objectMapper.valueToTree(repeated.payload).equals(objectMapper.valueToTree(action.payload()))) throw ApiException.conflict("Command ID already belongs to another payload");
                        if ("applied".equals(repeated.syncStatus)) return repeated.serverResult;
                        throw new ApiException("conflict".equals(repeated.syncStatus) ? 409 : 400, repeated.conflictMessage);
                    }
                    if (action.supersedes() != null) {
                        var original = orm.requiredLocked(action.supersedes());
                        UUID root = original.resolutionRoot == null ? original.commandId : original.resolutionRoot;
                        if (orm.hasAppliedCorrection(root)) throw ApiException.conflict("This command already has an applied correction");
                    }
                    Object value = execute(action);
                    audits.record(action, actor.id, "applied", value, null);
                    return value;
                });
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



    public java.util.List<ApiResponses.SyncAuditResponse> audit(
             String status,
              int page,
              int size) {
        actors.requireAdmin();
        return audits.list(status, page, size).stream().map(mapper::syncAudit).toList();
    }

    private Object execute(ApiModels.SyncAction action) {
        return switch (action.type()) {
            case "order.create" -> {
                actors.current();
                var value = validated(action.payload(), ApiModels.OrderInput.class);
                yield queries.projectOrder(orders.create(new ApiModels.OrderInput(
                        value.eventType(), value.faction(), value.eventDate(), value.eventOccurrenceId(), value.factionId(),
                        value.requestedPickupDate(), value.pickupLocation(), value.pickupLatitude(), value.pickupLongitude(),
                        value.collectorName(), value.notes(), value.requestedQuantities(),
                        value.requestedAssemblyQuantities(), action.idempotencyKey())));
            }
            case "transaction" -> {
                actors.requireWarehouse();
                var value = validated(action.payload(), ApiModels.TransactionInput.class);
                var input = new ApiModels.TransactionInput(value.itemId(), value.transactionType(), value.quantityChanged(),
                        value.reason(), value.notes(), value.eventType(), value.faction(), value.assetInstanceId(), value.userId(),
                        value.factionOrderId(), action.idempotencyKey(), value.eventOccurrenceId(), value.locationId(), value.lotId(), value.occurredAt());
                yield mapper.transaction(inventory.transact(input));
            }
            case "order.prepare" -> {
                actors.requireWarehouse();
                UUID orderId = uuid(action.payload(), "orderId");
                Object inputObj = action.payload().get("input");
                if (inputObj == null) {
                    throw ApiException.badRequest("Missing required property 'input' in order.prepare payload");
                }
                var value = validated(inputObj, ApiModels.PreparationInput.class);
                yield queries.projectOrder(orders.prepare(orderId, new ApiModels.PreparationInput(value.preparedQuantities(),
                        value.assetAssignments(), value.acknowledgeShortages(), action.idempotencyKey(), value.notes(), value.sourceLocations())));
            }
            case "order.transition" -> {
                UUID orderId = uuid(action.payload(), "orderId");
                Object statusObj = action.payload().get("status");
                if (statusObj == null || statusObj.toString().isBlank()) {
                    throw ApiException.badRequest("Missing required property 'status' in order.transition payload");
                }
                DomainEnums.OrderStatus target;
                try {
                    target = DomainEnums.OrderStatus.valueOf(statusObj.toString().trim());
                } catch (IllegalArgumentException e) {
                    throw ApiException.badRequest("Invalid order status: " + statusObj);
                }
                var value = validated(action.payload(), ApiModels.TransitionInput.class);
                yield queries.projectOrder(orders.transition(orderId, target, new ApiModels.TransitionInput(
                        action.idempotencyKey(), value.notes(), value.collectorName(), value.pickupLocation(),
                        value.pickupLatitude(), value.pickupLongitude())));
            }
            case "order.return" -> {
                actors.requireMarshal();
                UUID orderId = uuid(action.payload(), "orderId");
                Object inputObj = action.payload().get("input");
                if (inputObj == null) {
                    throw ApiException.badRequest("Missing required property 'input' in order.return payload");
                }
                var value = validated(inputObj, ApiModels.ReturnInput.class);
                yield queries.projectOrder(orders.returnItems(orderId,
                        new ApiModels.ReturnInput(value.lines(), value.assets(), action.idempotencyKey(), value.notes())));
            }
            case "damage.create" -> {
                var value = validated(action.payload(), ApiModels.DamageInput.class);
                yield mapper.damage(inventory.reportDamage(new ApiModels.DamageInput(
                        value.itemId(), value.amount(), value.description(), value.severity(), value.factionOrderId(),
                        action.idempotencyKey(), value.assetInstanceId(), value.handoverId(), value.safetyImpact(), value.assemblyId(), value.occurredAt())));
            }
            default -> throw ApiException.badRequest("Unsupported offline action type: " + action.type());
        };
    }

    @jakarta.transaction.Transactional
    public java.util.List<ApiResponses.SyncAuditResponse> myAudit(int page, int size) {
        var actor = actors.current();
        if (page < 0 || page > 100000 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        return orm.forActor(actor.id, page * size, size).stream().map(mapper::syncAudit).toList();
    }

    @jakarta.transaction.Transactional
    public Map<String, Object> context(UUID id) {
        var actor = actors.current(); var audit = audits.existing(id);
        if (audit == null || !audit.user.id.equals(actor.id)) throw ApiException.notFound("Sync command not found");
        var result = new java.util.LinkedHashMap<String, Object>();
        result.put("command", mapper.syncAudit(audit));
        result.put("checkedAt", java.time.Instant.now());
        if (audit.payload.get("orderId") != null) result.put("order", queries.order(uuid(audit.payload, "orderId")));
        if (audit.payload.get("itemId") != null) {
            UUID item = uuid(audit.payload, "itemId");
            result.put("item", queries.item(item));
            if (audit.payload.get("assetInstanceId") != null) result.put("assets", queries.itemAssets(item));
        }
        if (audit.payload.get("assemblyId") != null) result.put("assembly", queries.assembly(uuid(audit.payload, "assemblyId")));
        if (audit.payload.get("requestedQuantities") instanceof Map<?, ?> requested) {
            var items = new java.util.ArrayList<Object>();
            for (var key : requested.keySet()) items.add(queries.item(UUID.fromString(key.toString())));
            result.put("requestedItems", items);
        }
        if (audit.payload.get("input") instanceof Map<?, ?> input && input.get("preparedQuantities") instanceof Map<?, ?> quantities) {
            var stock = new java.util.ArrayList<Object>(); var assets = new java.util.ArrayList<Object>();
            for (var key : quantities.keySet()) {
                UUID itemId = UUID.fromString(key.toString());
                stock.add(queries.item(itemId)); assets.addAll(queries.itemAssets(itemId));
            }
            result.put("requestedItems", stock); result.put("assets", assets);
        }
        return result;
    }

    private <T> T validated(Object payload, Class<T> type) {
        T value = objectMapper.convertValue(payload, type);
        var violations = validator.validate(value);
        if (!violations.isEmpty()) throw ApiException.badRequest(violations.stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage()).sorted().collect(java.util.stream.Collectors.joining("; ")));
        return value;
    }

    private UUID uuid(Map<String, Object> payload, String key) {
        if (payload == null) {
            throw ApiException.badRequest("Action payload is required");
        }
        Object value = payload.get(key);
        if (value == null || value.toString().isBlank()) {
            throw ApiException.badRequest("Missing required property in sync action payload: " + key);
        }
        try {
            return UUID.fromString(value.toString().trim());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Invalid UUID format for property '" + key + "': " + value);
        }
    }
}
