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
    @jakarta.inject.Inject OrderPickupService pickupGroups;
    @jakarta.inject.Inject OrderAllocationService allocation;
    @jakarta.inject.Inject PositionService positions;
    private final ActorService actors;
    private final GeneralOrderOrm orm;
    private final InventoryOperationsService inventory;
    private final DomainEventService events;
    @jakarta.inject.Inject ItemRequestNotifier requests;
    @jakarta.inject.Inject org.ash.inventory.orm.ItemLocks itemLocks;

    public GeneralOrderService(ActorService actors, GeneralOrderOrm orm,
            InventoryOperationsService inventory, DomainEventService events) {
        this.actors = actors; this.orm = orm; this.inventory = inventory; this.events = events;
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public GeneralOrder create(ApiModels.GeneralOrderInput input) {
        actors.requireGeneralOrders();
        var order = new GeneralOrder(); order.createdBy = actors.current();
        assign(order, input); orm.persist(order); audit(order, "created", null, null); return order;
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public GeneralOrder update(UUID id, ApiModels.GeneralOrderInput input) {
        var order = locked(id); requireOwnerOrWarehouse(order); requireStatus(order, "draft");
        assign(order, input); audit(order, "updated", null, null); return order;
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public GeneralOrder transition(UUID id, String action, ApiModels.GeneralOrderPickupInput input) {
        var order = locked(id);
        var key = input == null ? null : input.idempotencyKey();
        switch (action) {
            case "prepare", "ready" -> actors.requireWarehouse();
            case "pickup" -> actors.requireTakeout();
            case "close" -> actors.requireWarehouse();
            default -> requireOwnerOrWarehouse(order);
        }
        if (replayed(order, key)) return order;
        switch (action) {
            case "submit" -> {
                requireOwnerOrWarehouse(order); requireStatus(order, "draft");
                if (order.eventOccurrence == null || order.lines.isEmpty()) throw ApiException.badRequest("Select an event and at least one item");
                order.status = "submitted";
                requests.notifyOwners(order.lines.stream().map(line -> line.item).toList(),
                        actors.current(), "general_order", order.name, order.id.toString());
            }
            case "prepare" -> { actors.requireWarehouse(); prepare(order, input); }
            case "ready" -> {
                actors.requireWarehouse(); requireStatus(order, "preparing");
                if (order.lines.stream().noneMatch(line -> line.preparedQuantity > 0)) throw ApiException.conflict("Prepare stock before marking ready");
                order.status = "ready";
            }
            case "pickup" -> {
                actors.requireTakeout(); requireStatus(order, "ready");
                var prepared = new LinkedHashMap<GeneralOrderLine, Integer>();
                for (var line : order.lines) if (line.preparedQuantity > 0) prepared.put(line, line.preparedQuantity);
                release(order);
                for (var entry : prepared.entrySet()) {
                    var line = entry.getKey();
                    transact(order, line, DomainEnums.TransactionType.checkout, entry.getValue(), line.item.trackingMode == DomainEnums.TrackingMode.serialized ? line.assetIds() : null);
                }
                for (var line : order.lines) {
                    line.preparedQuantity = prepared.getOrDefault(line, 0);
                    line.handedOverQuantity = line.preparedQuantity;
                }
                order.status = "picked_up";
            }
            case "close" -> { actors.requireWarehouse(); requireStatus(order, "returned"); order.status = "closed"; }
            case "cancel" -> {
                requireOwnerOrWarehouse(order);
                if (!List.of("draft", "submitted", "preparing", "ready").contains(order.status)) throw ApiException.conflict("This order can no longer be cancelled");
                release(order); order.status = "cancelled";
            }
            default -> throw ApiException.badRequest("Unknown order action: " + action);
        }
        audit(order, action, key, input == null ? null : input.notes());
        if (action.equals("submit") || action.equals("ready"))
            pickupGroups.notifyResponsible("general", order.id, action.equals("ready") ? "order_group_ready" : "order_items_assigned");
        if (action.equals("ready")) pickupGroups.notifyCreatorReady("general", order.id);
        return order;
    }

    private void prepare(GeneralOrder order, ApiModels.GeneralOrderPickupInput input) {
        if (!List.of("submitted", "preparing").contains(order.status)) throw ApiException.conflict("Order must be submitted or preparing");
        if (input == null || input.preparedQuantities() == null) throw ApiException.badRequest("Enter prepared quantities");
        var prepared = quantities(input.preparedQuantities());
        // Lock the union of the previous and the new preparation before releasing anything, in canonical order.
        var touched = new HashSet<>(prepared.keySet());
        order.lines.stream().filter(line -> line.preparedQuantity > 0).forEach(line -> touched.add(line.item.id));
        itemLocks.lock(touched);
        release(order);
        for (var line : order.lines) if (!prepared.containsKey(line.item.id)) clearPreparation(line);
        for (var itemId : new TreeSet<>(prepared.keySet())) {
            var item = lockedItem(itemId); int quantity = prepared.get(itemId);
            var line = order.line(itemId);
            if (line == null || quantity > line.requestedQuantity) throw ApiException.badRequest("Preparation exceeds requested quantity");
            inventory.assertCheckoutAllowed(item);
            var capacity = allocation.capacity(item, null, order.id);
            var source = input.sourceLocations() == null || input.sourceLocations().get(item.id) == null
                    ? allocation.defaultSource(item, capacity, quantity)
                    : positions.location(input.sourceLocations().get(item.id));
            int sourceCapacity = allocation.sourceCapacity(item, capacity, source, quantity);
            if (item.trackingMode != DomainEnums.TrackingMode.serialized && quantity > sourceCapacity) throw ApiException.conflict("Insufficient stock at source for " + item.name);
            if (quantity > inventory.availableFor(item, order.eventOccurrence, 0)) throw ApiException.conflict("Insufficient committed/available stock for " + item.name);
            var selected = new ArrayList<AssetInstance>();
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                var ids = input.assetAssignments() == null ? List.<UUID>of() : input.assetAssignments().getOrDefault(item.id, List.of());
                if (ids.size() != quantity || new HashSet<>(ids).size() != quantity) throw ApiException.badRequest("Select exactly " + quantity + " assets for " + item.name);
                for (var assetId : ids) {
                    var asset = orm.findLocked(AssetInstance.class, assetId);
                    if (asset == null || !asset.item.id.equals(item.id) || !asset.active || asset.availabilityStatus != DomainEnums.AssetState.available) throw ApiException.conflict("Asset is unavailable");
                    allocation.assertAssetEligible(asset, order.eventOccurrence);
                    asset.availabilityStatus = DomainEnums.AssetState.reserved;
                    selected.add(asset);
                }
            }
            line.sourceLocation = source; line.preparedQuantity = quantity;
            assignAssets(line, selected);
        }
        order.status = "preparing";
    }

    private void clearPreparation(GeneralOrderLine line) {
        line.preparedQuantity = 0; line.sourceLocation = null; assignAssets(line, List.of());
    }

    /** Keeps rows of assets that stay selected, so a re-preparation never re-inserts the same (line, asset) pair. */
    private void assignAssets(GeneralOrderLine line, List<AssetInstance> selected) {
        var wanted = selected.stream().map(asset -> asset.id).collect(java.util.stream.Collectors.toSet());
        line.assets.removeIf(assignment -> !wanted.contains(assignment.assetInstance.id));
        for (var asset : selected) {
            if (line.asset(asset.id) != null) continue;
            var assignment = new GeneralOrderLineAsset(); assignment.line = line; assignment.assetInstance = asset;
            line.assets.add(assignment);
        }
    }

    private void release(GeneralOrder order) {
        // Lock in the canonical order shared with faction orders and direct stock commands.
        var prepared = order.lines.stream().filter(line -> line.preparedQuantity > 0).map(line -> line.item.id).toList();
        itemLocks.lock(prepared);
        for (var itemId : prepared) lockedItem(itemId);
        for (var line : order.lines) for (var assignment : line.assets) {
            var asset = orm.findLocked(AssetInstance.class, assignment.assetInstance.id);
            if (asset != null && asset.availabilityStatus == DomainEnums.AssetState.reserved) asset.availabilityStatus = DomainEnums.AssetState.available;
        }
        for (var line : order.lines) line.preparedQuantity = 0;
        orm.flush();
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public GeneralOrder returnItems(UUID id, ApiModels.GeneralOrderReturnInput input) {
        actors.requireWarehouse(); var order = locked(id);
        if (input == null) throw ApiException.badRequest("Return data is required");
        if (replayed(order, input.idempotencyKey())) return order;
        if (!List.of("picked_up", "partially_returned").contains(order.status)) throw ApiException.conflict("Order must be picked up before return");
        var returned = quantities(input.returnedQuantities()); var consumed = quantities(input.consumedQuantities());
        var damaged = quantities(input.damagedQuantities()); var missing = quantities(input.missingQuantities()); var writtenOff = quantities(input.writtenOffQuantities());
        var mentioned = new HashSet<UUID>(); for (var map : List.of(returned, consumed, damaged, missing, writtenOff)) mentioned.addAll(map.keySet());
        if (input.missingQuantities() != null) mentioned.addAll(input.missingQuantities().keySet());
        if (input.missingAssets() != null) mentioned.addAll(input.missingAssets().keySet());
        if (mentioned.isEmpty()) throw ApiException.badRequest("Enter a return outcome");
        for (var itemId : mentioned) {
            var line = order.line(itemId);
            if (line == null || line.handedOverQuantity <= 0) throw ApiException.badRequest("Item is not in this order");
        }
        itemLocks.lock(mentioned);
        for (var itemId : new TreeSet<>(mentioned)) {
            var item = lockedItem(itemId); var line = order.line(itemId);
            int good = returned.getOrDefault(itemId, 0), used = consumed.getOrDefault(itemId, 0), bad = damaged.getOrDefault(itemId, 0), lost = writtenOff.getOrDefault(itemId, 0);
            int outstanding = CustodyQuantities.outstanding(line);
            // The general-order write-off reason is the command's notes.
            OrderReturnPolicy.validate(item, new OrderReturnPolicy.Outcome(good, used, bad, lost, missing.getOrDefault(itemId, 0), input.notes()),
                    outstanding, actors);
            var goodAssets = returnAssets(line, good, input.returnedAssets());
            var badAssets = returnAssets(line, bad, input.damagedAssets());
            var lostAssets = returnAssets(line, lost, input.writtenOffAssets());
            if (good > 0) transact(order, line, DomainEnums.TransactionType.checkin, good, goodAssets);
            if (bad > 0) {
                transact(order, line, DomainEnums.TransactionType.checkin, bad, badAssets);
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
            line.returnedQuantity += good; line.consumedQuantity += used; line.damagedQuantity += bad; line.writtenOffQuantity += lost;
            int remaining = outstanding - good - used - bad - lost;
            int missingNow = input.missingQuantities() != null && input.missingQuantities().containsKey(item.id) ? missing.getOrDefault(itemId, 0) : Math.max(0, line.missingQuantity - good - bad - lost);
            if (missingNow > remaining) throw ApiException.badRequest("Return quantities exceed outstanding quantity for " + item.name);
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                for (var assetId : input.missingAssets() == null ? List.<UUID>of() : input.missingAssets().getOrDefault(item.id, List.of())) {
                    var assignment = line.asset(assetId);
                    if (assignment == null || assignment.reconciled) throw ApiException.conflict("Missing asset is not outstanding on this order");
                    var asset = orm.findLocked(AssetInstance.class, assetId);
                    if (!List.of(DomainEnums.AssetState.in_field, DomainEnums.AssetState.in_custody, DomainEnums.AssetState.lost).contains(asset.availabilityStatus)) throw ApiException.conflict("Asset cannot be marked missing in its current state");
                    asset.availabilityStatus = DomainEnums.AssetState.lost; asset.conditionStatus = DomainEnums.ConditionStatus.lost;
                }
                missingNow = (int) line.assets.stream().filter(assignment -> !assignment.reconciled)
                        .filter(assignment -> assignment.assetInstance.availabilityStatus == DomainEnums.AssetState.lost).count();
            }
            line.missingQuantity = missingNow;
        }
        order.status = order.lines.stream().filter(line -> line.handedOverQuantity > 0)
                .allMatch(line -> CustodyQuantities.outstanding(line) == 0) ? "returned" : "partially_returned";
        audit(order, "return", input.idempotencyKey(), input.notes()); return order;
    }

    /** Marks the selected assets of a serialized line reconciled; {@code null} for bulk lines. */
    private List<String> returnAssets(GeneralOrderLine line, int amount, Map<UUID, List<UUID>> input) {
        if (line.item.trackingMode != DomainEnums.TrackingMode.serialized) return null;
        var selected = input == null ? List.<UUID>of() : input.getOrDefault(line.item.id, List.of());
        if (selected.size() != amount) throw ApiException.badRequest("Select exact returned assets for " + line.item.name);
        var result = new ArrayList<String>();
        for (var asset : selected) {
            var assignment = line.asset(asset);
            if (assignment == null || assignment.reconciled) throw ApiException.conflict("Asset was not assigned or has already been reconciled");
            var instance = orm.findLocked(AssetInstance.class, asset);
            if (instance.availabilityStatus == DomainEnums.AssetState.lost) {
                instance.availabilityStatus = DomainEnums.AssetState.in_field;
                instance.conditionStatus = DomainEnums.ConditionStatus.good;
            }
            assignment.reconciled = true; result.add(asset.toString());
        }
        return result;
    }

    private void damage(GeneralOrder order, Item item, int amount, UUID asset, String notes) {
        inventory.createDamage(new ApiModels.DamageInput(item.id, amount, OrderReturnPolicy.damageDescription(notes, order.name),
                OrderReturnPolicy.RETURN_DAMAGE_SEVERITY, null, null, asset, null, false, null, null));
    }
    private void ledger(GeneralOrder order, Item item, DomainEnums.TransactionType type, int amount, AssetInstance asset, String notes) {
        var tx = new StockTransaction(); tx.item = item; tx.assetInstance = asset; tx.user = order.createdBy; tx.type = type; tx.quantity = amount;
        tx.eventOccurrence = order.eventOccurrence; tx.eventType = order.eventOccurrence.eventType; tx.faction = "General order"; tx.relatedEntityType = "general_order"; tx.relatedEntityId = order.id;
        tx.custodyWriteOff = type == DomainEnums.TransactionType.written_off; tx.notes = notes; tx.reason = order.name; orm.persist(tx);
        events.record("stock.changed", "item", item.id, actors.current().id, null, Map.of("type", type.name(), "quantity", amount));
    }
    private void transact(GeneralOrder order, GeneralOrderLine line, DomainEnums.TransactionType type, int quantity, List<String> assets) {
        var itemId = line.item.id;
        if (assets == null) inventory.transact(new ApiModels.TransactionInput(itemId, type, quantity, order.name, order.purpose, order.eventOccurrence.eventType, "General order", null, order.createdBy.id, null, null, order.eventOccurrence.id, type == DomainEnums.TransactionType.checkout && line.sourceLocation != null ? line.sourceLocation.id : null, null, null), order.id);
        else for (var asset : assets) inventory.transact(new ApiModels.TransactionInput(itemId, type, 1, order.name, order.purpose, order.eventOccurrence.eventType, "General order", UUID.fromString(asset), order.createdBy.id, null, null, order.eventOccurrence.id), order.id);
    }
    /** Drafts only: requested lines are replaced; a line keeps its position while it stays requested. */
    private void assign(GeneralOrder order, ApiModels.GeneralOrderInput input) {
        order.name = input.name().trim(); order.purpose = input.purpose().trim(); order.eventOccurrence = input.eventOccurrenceId() == null ? null : orm.find(EventOccurrence.class, input.eventOccurrenceId());
        if (input.eventOccurrenceId() != null && order.eventOccurrence == null) throw ApiException.notFound("Event not found");
        var requested = quantities(input.requestedQuantities());
        order.lines.removeIf(line -> !requested.containsKey(line.item.id));
        int next = order.lines.stream().mapToInt(line -> line.lineNumber).max().orElse(0);
        for (var entry : requested.entrySet()) {
            var item = orm.find(Item.class, entry.getKey());
            actors.requireItemAccess(item);
            var line = order.line(entry.getKey());
            if (line == null) {
                line = new GeneralOrderLine(); line.order = order; line.item = item; line.lineNumber = ++next;
                order.lines.add(line);
            }
            line.requestedQuantity = entry.getValue();
        }
    }
    private GeneralOrder locked(UUID id) { actors.current(); var order = orm.locked(id); if (order == null) throw ApiException.notFound("Order not found"); return order; }
    private Item lockedItem(UUID id) { var item = orm.findLocked(Item.class, id); if (item == null || !item.active) throw ApiException.notFound("Item not found"); return item; }
    /** Positive quantities by item, in input order; zero entries are dropped. */
    private Map<UUID, Integer> quantities(Map<UUID, Integer> input) {
        var result = new LinkedHashMap<UUID, Integer>(); if (input == null) return result;
        input.forEach((id, quantity) -> { if (id == null || quantity == null || quantity < 0) throw ApiException.badRequest("Quantities must be non-negative"); if (quantity > 0) { if (orm.find(Item.class, id) == null) throw ApiException.notFound("Item not found"); result.put(id, quantity); } }); return result;
    }
    private void requireStatus(GeneralOrder order, String status) { if (!order.status.equals(status)) throw ApiException.conflict("Order must be " + status); }
    /** ASH crew change their own general orders; warehouse workers change every order. */
    private void requireOwnerOrWarehouse(GeneralOrder order) {
        var actor = actors.current();
        boolean owner = order.createdBy.id.equals(actor.id) && actor.role.atLeast(DomainEnums.UserRole.ash);
        if (!owner && !actor.role.atLeast(DomainEnums.UserRole.warehouse_crew)) throw ApiException.forbidden("Only the owner or a warehouse worker may change this order");
    }
    private boolean replayed(GeneralOrder order, UUID key) {
        if (key == null) return false;
        var history = orm.commandHistory(key);
        if (history != null && !history.order.id.equals(order.id)) throw ApiException.conflict("Command belongs to another order"); return history != null;
    }
    private void audit(GeneralOrder order, String action, UUID key, String notes) {
        var history = new GeneralOrderHistory(); history.order = order; history.actor = actors.current(); history.action = action; history.commandId = key; history.notes = notes;
        history.delta = Map.of("status", order.status, "requested", order.quantities(line -> line.requestedQuantity), "prepared", order.quantities(line -> line.preparedQuantity),
                "handedOver", order.quantities(line -> line.handedOverQuantity), "returned", order.quantities(line -> line.returnedQuantity),
                "consumed", order.quantities(line -> line.consumedQuantity), "damaged", order.quantities(line -> line.damagedQuantity),
                "missing", order.quantities(line -> line.missingQuantity), "writtenOff", order.quantities(line -> line.writtenOffQuantity));
        orm.persist(history); events.record("general_order." + action, "general_order", order.id, actors.current().id, key, Map.of("status", order.status));
    }
}
