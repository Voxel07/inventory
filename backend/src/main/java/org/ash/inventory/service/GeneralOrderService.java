package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.GeneralOrderOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import java.util.*;

@ApplicationScoped
public class GeneralOrderService {
    @jakarta.inject.Inject OrderAllocationService allocation;
    @jakarta.inject.Inject PositionService positions;
    private final ActorService actors;
    private final GeneralOrderOrm orm;
    private final InventoryOperationsService inventory;
    private final DomainEventService events;

    public GeneralOrderService(ActorService actors, GeneralOrderOrm orm,
            InventoryOperationsService inventory, DomainEventService events) {
        this.actors = actors; this.orm = orm; this.inventory = inventory; this.events = events;
    }

    @Transactional
    public GeneralOrder create(ApiModels.GeneralOrderInput input) {
        if (actors.current().role == DomainEnums.UserRole.read_only) throw ApiException.forbidden("Read-only access");
        var order = new GeneralOrder(); order.createdBy = actors.current();
        assign(order, input); orm.persist(order); audit(order, "created", null, null); return order;
    }

    @Transactional
    public GeneralOrder update(UUID id, ApiModels.GeneralOrderInput input) {
        var order = locked(id); requireOwnerOrPlanner(order); requireStatus(order, "draft");
        assign(order, input); audit(order, "updated", null, null); return order;
    }

    @Transactional
    public GeneralOrder transition(UUID id, String action, ApiModels.GeneralOrderPickupInput input) {
        var order = locked(id);
        var key = input == null ? null : input.idempotencyKey();
        switch (action) {
            case "prepare", "ready" -> actors.requireWarehouse();
            case "pickup", "close" -> actors.requireMarshal();
            default -> requireOwnerOrPlanner(order);
        }
        if (replayed(order, key)) return order;
        switch (action) {
            case "submit" -> {
                requireOwnerOrPlanner(order); requireStatus(order, "draft");
                if (order.eventOccurrence == null || order.requestedQuantities.isEmpty()) throw ApiException.badRequest("Select an event and at least one item");
                order.status = "submitted";
            }
            case "prepare" -> { actors.requireWarehouse(); prepare(order, input); }
            case "ready" -> {
                actors.requireWarehouse(); requireStatus(order, "preparing");
                if (order.preparedQuantities.values().stream().noneMatch(q -> q > 0)) throw ApiException.conflict("Prepare stock before marking ready");
                order.status = "ready";
            }
            case "pickup" -> {
                actors.requireMarshal(); requireStatus(order, "ready");
                var prepared = new LinkedHashMap<>(order.preparedQuantities);
                release(order);
                for (var entry : prepared.entrySet()) {
                    transact(order, entry.getKey(), DomainEnums.TransactionType.checkout, entry.getValue(), order.assetAssignments.get(entry.getKey()));
                }
                order.preparedQuantities = new LinkedHashMap<>(prepared); order.handedOverQuantities = prepared; order.status = "picked_up";
            }
            case "close" -> { actors.requireMarshal(); requireStatus(order, "returned"); order.status = "closed"; }
            case "cancel" -> {
                requireOwnerOrPlanner(order);
                if (!List.of("draft", "submitted", "preparing", "ready").contains(order.status)) throw ApiException.conflict("This order can no longer be cancelled");
                release(order); order.status = "cancelled";
            }
            default -> throw ApiException.badRequest("Unknown order action: " + action);
        }
        audit(order, action, key, input == null ? null : input.notes()); return order;
    }

    private void prepare(GeneralOrder order, ApiModels.GeneralOrderPickupInput input) {
        if (!List.of("submitted", "preparing").contains(order.status)) throw ApiException.conflict("Order must be submitted or preparing");
        if (input == null || input.preparedQuantities() == null) throw ApiException.badRequest("Enter prepared quantities");
        release(order);
        var prepared = quantities(input.preparedQuantities()); var sources = new LinkedHashMap<String, String>(); var assignments = new LinkedHashMap<String, List<String>>();
        for (var id : new TreeSet<>(prepared.keySet())) {
            var item = lockedItem(id); int quantity = prepared.get(id);
            if (quantity > order.requestedQuantities.getOrDefault(id, 0)) throw ApiException.badRequest("Preparation exceeds requested quantity");
            inventory.assertCheckoutAllowed(item);
            var source = input.sourceLocations() == null || input.sourceLocations().get(item.id) == null ? item.storageLocation : positions.location(input.sourceLocations().get(item.id));
            int sourceCapacity = allocation.sourceCapacity(item, source, null, order.id, quantity);
            if (source != null) sources.put(id, source.id.toString());
            if (item.trackingMode != DomainEnums.TrackingMode.serialized && quantity > sourceCapacity) throw ApiException.conflict("Insufficient stock at source for " + item.name);
            if (quantity > inventory.availableFor(item, order.eventOccurrence, 0)) throw ApiException.conflict("Insufficient committed/available stock for " + item.name);
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                var selected = input.assetAssignments() == null ? List.<UUID>of() : input.assetAssignments().getOrDefault(item.id, List.of());
                if (selected.size() != quantity || new HashSet<>(selected).size() != quantity) throw ApiException.badRequest("Select exactly " + quantity + " assets for " + item.name);
                for (var assetId : selected) {
                    var asset = orm.findLocked(AssetInstance.class, assetId);
                    if (asset == null || !asset.item.id.equals(item.id) || !asset.active || asset.availabilityStatus != DomainEnums.AssetState.available) throw ApiException.conflict("Asset is unavailable");
                    allocation.assertAssetEligible(asset, order.eventOccurrence);
                    asset.availabilityStatus = DomainEnums.AssetState.reserved;
                }
                assignments.put(id, selected.stream().map(UUID::toString).toList());
            }
        }
        order.sourceLocations = sources; order.preparedQuantities = prepared; order.assetAssignments = assignments; order.status = "preparing";
    }

    private void release(GeneralOrder order) {
        // Lock in a stable order, shared with the preparation path and direct checkout.
        for (var id : new TreeSet<>(order.preparedQuantities.keySet())) lockedItem(id);
        for (var selected : order.assetAssignments.values()) for (var id : selected) {
            var asset = orm.findLocked(AssetInstance.class, UUID.fromString(id));
            if (asset != null && asset.availabilityStatus == DomainEnums.AssetState.reserved) asset.availabilityStatus = DomainEnums.AssetState.available;
        }
        order.preparedQuantities = new LinkedHashMap<>(); orm.flush();
    }

    @Transactional
    public GeneralOrder returnItems(UUID id, ApiModels.GeneralOrderReturnInput input) {
        actors.requireMarshal(); var order = locked(id);
        if (input == null) throw ApiException.badRequest("Return data is required");
        if (replayed(order, input.idempotencyKey())) return order;
        if (!List.of("picked_up", "partially_returned").contains(order.status)) throw ApiException.conflict("Order must be picked up before return");
        var returned = quantities(input.returnedQuantities()); var consumed = quantities(input.consumedQuantities());
        var damaged = quantities(input.damagedQuantities()); var missing = quantities(input.missingQuantities()); var writtenOff = quantities(input.writtenOffQuantities());
        var mentioned = new HashSet<String>(); for (var map : List.of(returned, consumed, damaged, missing, writtenOff)) mentioned.addAll(map.keySet());
        if (input.missingQuantities() != null) input.missingQuantities().keySet().forEach(idValue -> mentioned.add(idValue.toString()));
        if (input.missingAssets() != null) input.missingAssets().keySet().forEach(idValue -> mentioned.add(idValue.toString()));
        if (mentioned.isEmpty()) throw ApiException.badRequest("Enter a return outcome");
        if (!order.handedOverQuantities.keySet().containsAll(mentioned)) throw ApiException.badRequest("Item is not in this order");
        if (!writtenOff.isEmpty()) { actors.requireAdmin(); if (input.notes() == null || input.notes().isBlank()) throw ApiException.badRequest("Write-off reason is required"); }
        var nextReturned = new LinkedHashMap<>(order.returnedQuantities); var nextConsumed = new LinkedHashMap<>(order.consumedQuantities);
        var nextDamaged = new LinkedHashMap<>(order.damagedQuantities); var nextMissing = new LinkedHashMap<>(order.missingQuantities); var nextWritten = new LinkedHashMap<>(order.writtenOffQuantities);
        var reconciled = new LinkedHashMap<>(order.reconciledAssets);
        for (var idString : new TreeSet<>(mentioned)) {
            var item = lockedItem(idString); int good = returned.getOrDefault(idString, 0), used = consumed.getOrDefault(idString, 0), bad = damaged.getOrDefault(idString, 0), lost = writtenOff.getOrDefault(idString, 0);
            int outstanding = outstanding(order, idString);
            if (good + used + bad + lost > outstanding) throw ApiException.badRequest("Return exceeds outstanding quantity for " + item.name);
            if (used > 0 && !item.consumable) throw ApiException.badRequest("Only consumables can be consumed");
            var completed = new ArrayList<>(reconciled.getOrDefault(idString, List.of()));
            var goodAssets = returnAssets(order, item, good, input.returnedAssets(), completed);
            var badAssets = returnAssets(order, item, bad, input.damagedAssets(), completed);
            var lostAssets = returnAssets(order, item, lost, input.writtenOffAssets(), completed);
            if (good > 0) transact(order, idString, DomainEnums.TransactionType.checkin, good, goodAssets);
            if (bad > 0) {
                transact(order, idString, DomainEnums.TransactionType.checkin, bad, badAssets);
                if (badAssets == null) damage(order, item, bad, null, input.notes());
                else for (var asset : badAssets) damage(order, item, 1, UUID.fromString(asset), input.notes());
            }
            if (used > 0) ledger(order, item, DomainEnums.TransactionType.consumed, used, null, input.notes());
            if (lost > 0) {
                if (lostAssets == null) ledger(order, item, DomainEnums.TransactionType.written_off, lost, null, input.notes());
                else for (var assetId : lostAssets) {
                    var asset = orm.findLocked(AssetInstance.class, UUID.fromString(assetId));
                    asset.availabilityStatus = DomainEnums.AssetState.written_off; asset.active = false;
                    ledger(order, item, DomainEnums.TransactionType.written_off, 1, asset, input.notes());
                }
            }
            nextReturned.merge(idString, good, Integer::sum); nextConsumed.merge(idString, used, Integer::sum); nextDamaged.merge(idString, bad, Integer::sum); nextWritten.merge(idString, lost, Integer::sum);
            int remaining = outstanding - good - used - bad - lost;
            int missingNow = input.missingQuantities() != null && input.missingQuantities().containsKey(item.id) ? missing.getOrDefault(idString, 0) : Math.max(0, nextMissing.getOrDefault(idString, 0) - good - bad - lost);
            if (missingNow > remaining) throw ApiException.badRequest("Missing exceeds outstanding quantity");
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                for (var assetId : input.missingAssets() == null ? List.<UUID>of() : input.missingAssets().getOrDefault(item.id, List.of())) {
                    if (!order.assetAssignments.getOrDefault(idString, List.of()).contains(assetId.toString()) || completed.contains(assetId.toString())) throw ApiException.conflict("Missing asset is not outstanding on this order");
                    var asset = orm.findLocked(AssetInstance.class, assetId);
                    if (!List.of(DomainEnums.AssetState.in_field, DomainEnums.AssetState.in_custody, DomainEnums.AssetState.lost).contains(asset.availabilityStatus)) throw ApiException.conflict("Asset cannot be marked missing in its current state");
                    asset.availabilityStatus = DomainEnums.AssetState.lost; asset.conditionStatus = DomainEnums.ConditionStatus.lost;
                }
                missingNow = (int) order.assetAssignments.getOrDefault(idString, List.of()).stream().filter(assetId -> !completed.contains(assetId))
                        .map(assetId -> orm.find(AssetInstance.class, UUID.fromString(assetId))).filter(asset -> asset.availabilityStatus == DomainEnums.AssetState.lost).count();
            }
            nextMissing.put(idString, missingNow); reconciled.put(idString, completed);
        }
        order.returnedQuantities = nextReturned; order.consumedQuantities = nextConsumed; order.damagedQuantities = nextDamaged; order.missingQuantities = nextMissing; order.writtenOffQuantities = nextWritten; order.reconciledAssets = reconciled;
        order.status = order.handedOverQuantities.keySet().stream().allMatch(idString -> outstanding(order, idString) == 0) ? "returned" : "partially_returned";
        audit(order, "return", input.idempotencyKey(), input.notes()); return order;
    }

    private List<String> returnAssets(GeneralOrder order, Item item, int amount, Map<UUID, List<UUID>> input, List<String> completed) {
        if (item.trackingMode != DomainEnums.TrackingMode.serialized) return null;
        var selected = input == null ? List.<UUID>of() : input.getOrDefault(item.id, List.of());
        if (selected.size() != amount) throw ApiException.badRequest("Select exact returned assets for " + item.name);
        var result = new ArrayList<String>();
        for (var asset : selected) {
            String id = asset.toString();
            if (!order.assetAssignments.getOrDefault(item.id.toString(), List.of()).contains(id) || completed.contains(id)) throw ApiException.conflict("Asset was not assigned or has already been reconciled");
            var instance = orm.findLocked(AssetInstance.class, asset);
            if (instance.availabilityStatus == DomainEnums.AssetState.lost) {
                instance.availabilityStatus = DomainEnums.AssetState.in_field;
                instance.conditionStatus = DomainEnums.ConditionStatus.good;
            }
            completed.add(id); result.add(id);
        }
        return result;
    }

    private void damage(GeneralOrder order, Item item, int amount, UUID asset, String notes) {
        inventory.createDamage(new ApiModels.DamageInput(item.id, amount, notes == null || notes.isBlank() ? "Return damage: " + order.name : notes, DomainEnums.DamageSeverity.medium, null, null, asset, null, false, null));
    }
    private int outstanding(GeneralOrder order, String id) {
        return CustodyQuantities.outstanding(order, id);
    }
    private void ledger(GeneralOrder order, Item item, DomainEnums.TransactionType type, int amount, AssetInstance asset, String notes) {
        var tx = new StockTransaction(); tx.item = item; tx.assetInstance = asset; tx.user = order.createdBy; tx.type = type; tx.quantity = amount;
        tx.eventOccurrence = order.eventOccurrence; tx.eventType = order.eventOccurrence.eventType; tx.faction = "General order"; tx.relatedEntityType = "general_order"; tx.relatedEntityId = order.id;
        tx.custodyWriteOff = type == DomainEnums.TransactionType.written_off; tx.notes = notes; tx.reason = order.name; orm.persist(tx);
        events.record("stock.changed", "item", item.id, actors.current().id, null, Map.of("type", type.name(), "quantity", amount));
    }
    private void transact(GeneralOrder order, String id, DomainEnums.TransactionType type, int quantity, List<String> assets) {
        if (assets == null) link(order, inventory.transact(new ApiModels.TransactionInput(UUID.fromString(id), type, quantity, order.name, order.purpose, order.eventOccurrence.eventType, "General order", null, order.createdBy.id, null, null, order.eventOccurrence.id, type == DomainEnums.TransactionType.checkout && order.sourceLocations.containsKey(id) ? UUID.fromString(order.sourceLocations.get(id)) : null, null)));
        else for (var asset : assets) link(order, inventory.transact(new ApiModels.TransactionInput(UUID.fromString(id), type, 1, order.name, order.purpose, order.eventOccurrence.eventType, "General order", UUID.fromString(asset), order.createdBy.id, null, null, order.eventOccurrence.id)));
    }
    private void link(GeneralOrder order, StockTransaction tx) { tx.relatedEntityType = "general_order"; tx.relatedEntityId = order.id; }
    private void assign(GeneralOrder order, ApiModels.GeneralOrderInput input) {
        order.name = input.name().trim(); order.purpose = input.purpose().trim(); order.eventOccurrence = input.eventOccurrenceId() == null ? null : orm.find(EventOccurrence.class, input.eventOccurrenceId());
        if (input.eventOccurrenceId() != null && order.eventOccurrence == null) throw ApiException.notFound("Event not found");
        order.requestedQuantities = quantities(input.requestedQuantities());
        for (var id : order.requestedQuantities.keySet()) actors.requireItemAccess(orm.find(Item.class, UUID.fromString(id)));
    }
    private GeneralOrder locked(UUID id) { actors.current(); var order = orm.locked(id); if (order == null) throw ApiException.notFound("Order not found"); return order; }
    private Item lockedItem(String id) { var item = orm.findLocked(Item.class, UUID.fromString(id)); if (item == null || !item.active) throw ApiException.notFound("Item not found"); return item; }
    private Map<String, Integer> quantities(Map<UUID, Integer> input) {
        var result = new LinkedHashMap<String, Integer>(); if (input == null) return result;
        input.forEach((id, quantity) -> { if (id == null || quantity == null || quantity < 0) throw ApiException.badRequest("Quantities must be non-negative"); if (quantity > 0) { if (orm.find(Item.class, id) == null) throw ApiException.notFound("Item not found"); result.put(id.toString(), quantity); } }); return result;
    }
    private void requireStatus(GeneralOrder order, String status) { if (!order.status.equals(status)) throw ApiException.conflict("Order must be " + status); }
    private void requireOwnerOrPlanner(GeneralOrder order) {
        var actor = actors.current();
        if (actor.role == DomainEnums.UserRole.read_only || (!order.createdBy.id.equals(actor.id) && !List.of(DomainEnums.UserRole.hq_admin, DomainEnums.UserRole.event_planner, DomainEnums.UserRole.warehouse_crew).contains(actor.role))) throw ApiException.forbidden("Only the owner or an order manager may change this order");
    }
    private boolean replayed(GeneralOrder order, UUID key) {
        if (key == null) return false;
        var history = orm.commandHistory(key);
        if (history != null && !history.order.id.equals(order.id)) throw ApiException.conflict("Command belongs to another order"); return history != null;
    }
    private void audit(GeneralOrder order, String action, UUID key, String notes) {
        var history = new GeneralOrderHistory(); history.order = order; history.actor = actors.current(); history.action = action; history.commandId = key; history.notes = notes;
        history.delta = Map.of("status", order.status, "requested", new LinkedHashMap<>(order.requestedQuantities), "prepared", new LinkedHashMap<>(order.preparedQuantities), "handedOver", new LinkedHashMap<>(order.handedOverQuantities), "returned", new LinkedHashMap<>(order.returnedQuantities), "consumed", new LinkedHashMap<>(order.consumedQuantities), "damaged", new LinkedHashMap<>(order.damagedQuantities), "missing", new LinkedHashMap<>(order.missingQuantities), "writtenOff", new LinkedHashMap<>(order.writtenOffQuantities));
        orm.persist(history); events.record("general_order." + action, "general_order", order.id, actors.current().id, key, Map.of("status", order.status));
    }
}
