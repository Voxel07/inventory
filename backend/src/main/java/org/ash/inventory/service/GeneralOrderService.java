package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import io.quarkus.cache.CacheInvalidateAll;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.GeneralOrder;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.orm.GeneralOrderOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class GeneralOrderService {
    private final ActorService actors;
    private final GeneralOrderOrm orm;
    private final EntityManager em;
    private final InventoryOperationsService inventory;

    public GeneralOrderService(ActorService actors, GeneralOrderOrm orm, EntityManager em,
            InventoryOperationsService inventory) {
        this.actors = actors;
        this.orm = orm;
        this.em = em;
        this.inventory = inventory;
    }

    @Transactional
    public GeneralOrder create(ApiModels.GeneralOrderInput input) {
        var order = new GeneralOrder();
        order.createdBy = actors.current();
        assign(order, input);
        orm.persist(order);
        return order;
    }

    @Transactional
    public GeneralOrder update(UUID id, ApiModels.GeneralOrderInput input) {
        var order = locked(id);
        requireStatus(order, "draft");
        assign(order, input);
        return order;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "events-cache")
    public GeneralOrder transition(UUID id, String action, ApiModels.GeneralOrderPickupInput input) {
        var order = locked(id);
        switch (action) {
            case "submit" -> {
                requireStatus(order, "draft");
                if (order.eventOccurrence == null || order.requestedQuantities.isEmpty())
                    throw ApiException.badRequest("Select an event and at least one item");
                order.status = "submitted";
            }
            case "ready" -> { requireStatus(order, "submitted"); order.status = "ready"; }
            case "pickup" -> {
                requireStatus(order, "ready");
                pickup(order, input == null ? null : input.assetAssignments());
                order.status = "picked_up";
            }
            case "close" -> { requireStatus(order, "returned"); order.status = "closed"; }
            case "cancel" -> {
                if (!List.of("draft", "submitted", "ready").contains(order.status))
                    throw ApiException.conflict("This order can no longer be cancelled");
                order.status = "cancelled";
            }
            default -> throw ApiException.badRequest("Unknown order action: " + action);
        }
        return order;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "events-cache")
    public GeneralOrder returnItems(UUID id, ApiModels.GeneralOrderReturnInput input) {
        var order = locked(id);
        if (!List.of("picked_up", "partially_returned").contains(order.status))
            throw ApiException.conflict("Order must be picked up before items can be returned");
        var returned = quantities(input.returnedQuantities());
        var consumed = quantities(input.consumedQuantities());
        if (returned.isEmpty() && consumed.isEmpty()) throw ApiException.badRequest("Enter a returned or consumed quantity");
        var nextReturned = new LinkedHashMap<>(order.returnedQuantities);
        var nextConsumed = new LinkedHashMap<>(order.consumedQuantities);
        for (var entry : order.handedOverQuantities.entrySet()) {
            String itemId = entry.getKey();
            int addReturned = returned.getOrDefault(itemId, 0);
            int addConsumed = consumed.getOrDefault(itemId, 0);
            int priorReturned = nextReturned.getOrDefault(itemId, 0);
            int total = priorReturned + nextConsumed.getOrDefault(itemId, 0) + addReturned + addConsumed;
            if (total > entry.getValue()) throw ApiException.badRequest("Return exceeds handed over quantity for " + itemId);
            var assigned = order.assetAssignments.get(itemId);
            if (addConsumed > 0 && !item(itemId).consumable) throw ApiException.badRequest("Only consumable items can be consumed");
            if (addReturned > 0) {
                transact(order, itemId, DomainEnums.TransactionType.checkin, addReturned,
                        assigned == null ? null : assigned.subList(priorReturned, priorReturned + addReturned));
                nextReturned.merge(itemId, addReturned, Integer::sum);
            }
            if (addConsumed > 0) {
                var stockItem = item(itemId);
                var tx = new StockTransaction();
                tx.item = stockItem;
                tx.user = actors.current();
                tx.type = DomainEnums.TransactionType.consumed;
                tx.quantity = addConsumed;
                tx.eventType = order.eventOccurrence.eventType;
                tx.faction = "General order";
                tx.reason = "General order consumption " + order.name;
                tx.availabilityBefore = inventory.stock(stockItem).available();
                em.persist(tx);
                tx.availabilityAfter = inventory.stock(stockItem).available();
                nextConsumed.merge(itemId, addConsumed, Integer::sum);
            }
        }
        for (var itemId : returned.keySet()) if (!order.handedOverQuantities.containsKey(itemId)) throw ApiException.badRequest("Item is not in this order");
        for (var itemId : consumed.keySet()) if (!order.handedOverQuantities.containsKey(itemId)) throw ApiException.badRequest("Item is not in this order");
        order.returnedQuantities = nextReturned;
        order.consumedQuantities = nextConsumed;
        order.status = order.handedOverQuantities.entrySet().stream().allMatch(entry ->
                nextReturned.getOrDefault(entry.getKey(), 0) + nextConsumed.getOrDefault(entry.getKey(), 0) == entry.getValue())
                ? "returned" : "partially_returned";
        return order;
    }

    private void assign(GeneralOrder order, ApiModels.GeneralOrderInput input) {
        order.name = input.name().trim();
        order.purpose = input.purpose().trim();
        order.eventOccurrence = input.eventOccurrenceId() == null ? null : em.find(EventOccurrence.class, input.eventOccurrenceId());
        if (input.eventOccurrenceId() != null && order.eventOccurrence == null) throw ApiException.notFound("Event not found");
        order.requestedQuantities = quantities(input.requestedQuantities());
    }

    private void pickup(GeneralOrder order, Map<UUID, List<UUID>> selections) {
        var assignments = new LinkedHashMap<String, List<String>>();
        for (var entry : order.requestedQuantities.entrySet()) {
            var item = item(entry.getKey());
            List<String> assets = null;
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                var selected = selections == null ? null : selections.get(item.id);
                if (selected == null || selected.size() != entry.getValue() || selected.stream().distinct().count() != selected.size())
                    throw ApiException.badRequest("Select exactly " + entry.getValue() + " assets for " + item.name);
                assets = selected.stream().map(UUID::toString).toList();
                for (var assetId : selected) {
                    var asset = em.find(AssetInstance.class, assetId);
                    if (asset == null || !asset.item.id.equals(item.id)) throw ApiException.badRequest("Asset does not belong to " + item.name);
                }
                assignments.put(entry.getKey(), assets);
            }
            transact(order, entry.getKey(), DomainEnums.TransactionType.checkout, entry.getValue(), assets);
        }
        order.assetAssignments = assignments;
        order.handedOverQuantities = new LinkedHashMap<>(order.requestedQuantities);
    }

    private void transact(GeneralOrder order, String id, DomainEnums.TransactionType type, int quantity, List<String> assets) {
        if (assets == null) {
            inventory.transact(new ApiModels.TransactionInput(UUID.fromString(id), type, quantity,
                    "General order " + order.name, order.purpose, order.eventOccurrence.eventType,
                    "General order", null, null, null, null));
        } else {
            for (var assetId : assets) inventory.transact(new ApiModels.TransactionInput(UUID.fromString(id), type, 1,
                    "General order " + order.name, order.purpose, order.eventOccurrence.eventType,
                    "General order", UUID.fromString(assetId), null, null, null));
        }
    }

    private GeneralOrder locked(UUID id) {
        actors.current();
        var order = orm.locked(id);
        if (order == null) throw ApiException.notFound("General order not found");
        return order;
    }

    private Item item(String id) {
        var result = em.find(Item.class, UUID.fromString(id));
        if (result == null) throw ApiException.notFound("Item not found");
        return result;
    }

    private Map<String, Integer> quantities(Map<UUID, Integer> input) {
        var result = new LinkedHashMap<String, Integer>();
        if (input == null) return result;
        input.forEach((id, quantity) -> {
            if (id == null || quantity == null || quantity < 0) throw ApiException.badRequest("Quantities must be non-negative");
            if (quantity > 0) {
                item(id.toString());
                result.put(id.toString(), quantity);
            }
        });
        return result;
    }

    private void requireStatus(GeneralOrder order, String expected) {
        if (!order.status.equals(expected)) throw ApiException.conflict("Order must be " + expected + " for this action");
    }
}
