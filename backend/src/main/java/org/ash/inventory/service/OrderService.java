package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import org.ash.inventory.api.ApiException;
import org.ash.inventory.api.ApiModels;
import org.ash.inventory.domain.Assembly;
import org.ash.inventory.domain.AssemblyItem;
import org.ash.inventory.domain.DamageReport;
import org.ash.inventory.domain.DomainEnums;
import org.ash.inventory.domain.EventOccurrence;
import org.ash.inventory.domain.Faction;
import org.ash.inventory.domain.FactionOrder;
import org.ash.inventory.domain.FactionOrderHistory;
import org.ash.inventory.domain.FactionOrderLine;
import org.ash.inventory.domain.Item;
import org.ash.inventory.domain.Notification;
import org.ash.inventory.domain.StockTransaction;
import org.ash.inventory.domain.StorageLocation;
import org.ash.inventory.domain.UserAccount;
import org.ash.inventory.security.ActorService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class OrderService {
    @Inject EntityManager entityManager;
    @Inject ActorService actors;
    @Inject CatalogService catalog;
    @Inject InventoryOperationsService inventory;

    private static final Map<DomainEnums.OrderStatus, Set<DomainEnums.OrderStatus>> TRANSITIONS = Map.of(
            DomainEnums.OrderStatus.draft, Set.of(DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.cancelled),
            DomainEnums.OrderStatus.submitted, Set.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.cancelled),
            DomainEnums.OrderStatus.preparing, Set.of(DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.ready, DomainEnums.OrderStatus.cancelled),
            DomainEnums.OrderStatus.ready, Set.of(DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.picked_up, DomainEnums.OrderStatus.cancelled),
            DomainEnums.OrderStatus.picked_up, Set.of(DomainEnums.OrderStatus.partially_returned, DomainEnums.OrderStatus.returned),
            DomainEnums.OrderStatus.partially_returned, Set.of(DomainEnums.OrderStatus.partially_returned, DomainEnums.OrderStatus.returned),
            DomainEnums.OrderStatus.returned, Set.of(DomainEnums.OrderStatus.closed)
    );

    @Transactional
    public FactionOrder create(ApiModels.OrderInput input) {
        var actor = actors.current();
        var event = input.eventOccurrenceId() != null
                ? required(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence")
                : catalog.findOrCreateEvent(requiredText(input.eventType(), "eventType"), requiredDate(input.eventDate()));
        var faction = input.factionId() != null
                ? required(Faction.class, input.factionId(), "Faction")
                : catalog.findOrCreateFaction(event.eventType, requiredText(input.faction(), "faction"));
        assertFactionAccess(actor, faction);
        var order = new FactionOrder();
        order.eventOccurrence = event;
        order.faction = faction;
        order.pickupLocation = input.pickupLocation() == null ? null : required(StorageLocation.class, input.pickupLocation(), "Pickup location");
        order.collectorName = input.collectorName();
        order.notes = input.notes();
        order.createdBy = actor;
        order.orderCode = nextOrderCode(event, faction);
        order.persist();
        replaceLines(order, input);
        audit(order, actor, "created", null, DomainEnums.OrderStatus.draft, null, input.notes(), lineSnapshot(order));
        return order;
    }

    @Transactional
    public FactionOrder update(UUID id, ApiModels.OrderInput input) {
        var order = lockedOrder(id);
        assertFactionAccess(actors.current(), order.faction);
        if (order.status != DomainEnums.OrderStatus.draft && order.status != DomainEnums.OrderStatus.submitted) {
            throw ApiException.conflict("Only draft or submitted orders can be edited");
        }
        order.pickupLocation = input.pickupLocation() == null ? order.pickupLocation : required(StorageLocation.class, input.pickupLocation(), "Pickup location");
        order.collectorName = input.collectorName();
        order.notes = input.notes();
        replaceLines(order, input);
        audit(order, actors.current(), "updated", order.status, order.status, null, input.notes(), lineSnapshot(order));
        return order;
    }

    @Transactional
    public FactionOrder prepare(UUID id, ApiModels.PreparationInput input) {
        actors.requireManager();
        var order = lockedOrder(id);
        if (idempotent(order, input.idempotencyKey())) return order;
        if (order.status == DomainEnums.OrderStatus.submitted) transition(order, DomainEnums.OrderStatus.preparing, null, "preparation_started", input.notes(), Map.of());
        else if (order.status != DomainEnums.OrderStatus.preparing) throw ApiException.conflict("Order must be submitted or preparing");

        var lines = FactionOrderLine.<FactionOrderLine>list("order", order);
        var requestedByItem = aggregate(lines, false);
        for (var entry : requestedByItem.entrySet()) {
            int prepared = input.preparedQuantities() == null ? 0 : input.preparedQuantities().getOrDefault(entry.getKey().id, 0);
            if (prepared < 0 || prepared > entry.getValue()) throw ApiException.badRequest("Prepared quantity for " + entry.getKey().name + " is outside the requested range");
            int currentReservation = lines.stream().filter(line -> line.item.id.equals(entry.getKey().id)).mapToInt(line -> line.preparedQuantity).sum();
            int availableIncludingThisOrder = inventory.stock(entry.getKey()).available() + currentReservation;
            if (prepared > availableIncludingThisOrder && !input.acknowledgeShortages()) {
                throw ApiException.conflict("Only " + availableIncludingThisOrder + " units of " + entry.getKey().name + " can be reserved");
            }
            distributePrepared(lines, entry.getKey(), Math.min(prepared, availableIncludingThisOrder));
        }
        order.preparedBy = actors.current();
        audit(order, actors.current(), "preparation_saved", order.status, order.status, input.idempotencyKey(), input.notes(), lineSnapshot(order));
        return order;
    }

    @Transactional
    public FactionOrder transition(UUID id, DomainEnums.OrderStatus target, ApiModels.TransitionInput input) {
        var order = lockedOrder(id);
        var actor = actors.current();
        if (idempotent(order, input.idempotencyKey())) return order;
        if (target != DomainEnums.OrderStatus.submitted && target != DomainEnums.OrderStatus.draft) actors.requireManager();
        else assertFactionAccess(actor, order.faction);
        if (target == DomainEnums.OrderStatus.ready) {
            var lines = FactionOrderLine.<FactionOrderLine>list("order", order);
            boolean nonePrepared = lines.stream().allMatch(line -> line.preparedQuantity == 0);
            if (nonePrepared) throw ApiException.conflict("An order cannot be ready before any items are prepared");
            order.readyBy = actor;
        }
        if (target == DomainEnums.OrderStatus.picked_up) {
            order.collectorName = input.collectorName() == null ? order.collectorName : input.collectorName();
            pickup(order, actor, input.idempotencyKey());
            order.pickedUpBy = actor;
        }
        if (target == DomainEnums.OrderStatus.closed && hasOutstanding(order)) throw ApiException.conflict("Order still has outstanding units");
        transition(order, target, input.idempotencyKey(), actionFor(target), input.notes(), lineSnapshot(order));
        if (target == DomainEnums.OrderStatus.ready) createReadyNotification(order);
        return order;
    }

    @Transactional
    public FactionOrder returnItems(UUID id, ApiModels.ReturnInput input) {
        actors.requireManager();
        var order = lockedOrder(id);
        if (idempotent(order, input.idempotencyKey())) return order;
        if (order.status != DomainEnums.OrderStatus.picked_up && order.status != DomainEnums.OrderStatus.partially_returned) {
            throw ApiException.conflict("Order must be picked up before returns can be recorded");
        }
        var actor = actors.current();
        var lines = FactionOrderLine.<FactionOrderLine>list("order", order);
        for (var entry : input.lines().entrySet()) {
            var item = entityManager.find(Item.class, entry.getKey(), LockModeType.PESSIMISTIC_WRITE);
            if (item == null) throw ApiException.notFound("Item not found");
            var relevant = lines.stream().filter(line -> line.item.id.equals(item.id)).toList();
            int outstanding = relevant.stream().mapToInt(line -> line.pickedUpQuantity - line.returnedQuantity - line.damagedQuantity).sum();
            var outcome = entry.getValue();
            int reconciled = outcome.returned() + outcome.damaged();
            if (reconciled + outcome.missing() > outstanding) throw ApiException.badRequest("Return quantities exceed outstanding quantity for " + item.name);
            distributeReturn(relevant, outcome.returned(), outcome.damaged(), outcome.missing());

            if (outcome.returned() > 0) createReturnTransaction(item, order, actor,
                    item.consumable ? DomainEnums.TransactionType.consumed : DomainEnums.TransactionType.checkin,
                    outcome.returned(), null, outcome.notes());
            if (outcome.damaged() > 0) {
                createReturnTransaction(item, order, actor, DomainEnums.TransactionType.checkin,
                        outcome.damaged(), null, "Returned damaged: " + outcome.notes());
                var damage = new DamageReport();
                damage.item = item;
                damage.reporter = actor;
                damage.factionOrder = order;
                damage.quantity = outcome.damaged();
                damage.severity = DomainEnums.DamageSeverity.high;
                damage.description = outcome.notes() == null ? "Damage recorded during order return" : outcome.notes();
                damage.persist();
            }
            if (outcome.operatingHours() != null && outcome.operatingHours().compareTo(item.currentOperatingHours) >= 0) {
                item.currentOperatingHours = outcome.operatingHours();
            }
        }
        order.returnedBy = actor;
        var target = hasOutstanding(order) ? DomainEnums.OrderStatus.partially_returned : DomainEnums.OrderStatus.returned;
        transition(order, target, input.idempotencyKey(), target == DomainEnums.OrderStatus.returned ? "returned" : "partially_returned", input.notes(), lineSnapshot(order));
        return order;
    }

    @Transactional
    public FactionOrder returnAll(UUID id, UUID idempotencyKey) {
        var order = lockedOrder(id);
        var lines = FactionOrderLine.<FactionOrderLine>list("order", order);
        var outcomes = new LinkedHashMap<UUID, ApiModels.ReturnLine>();
        for (var entry : aggregateOutstanding(lines).entrySet()) outcomes.put(entry.getKey().id,
                new ApiModels.ReturnLine(entry.getValue(), 0, 0, null, "Full order return"));
        return returnItems(id, new ApiModels.ReturnInput(outcomes, idempotencyKey, "Full order return"));
    }

    public void assertCanView(FactionOrder order) {
        assertFactionAccess(actors.current(), order.faction);
    }

    private void pickup(FactionOrder order, UserAccount actor, UUID idempotencyKey) {
        var lines = FactionOrderLine.<FactionOrderLine>list("order", order);
        for (var entry : aggregatePrepared(lines).entrySet()) {
            var item = entityManager.find(Item.class, entry.getKey().id, LockModeType.PESSIMISTIC_WRITE);
            inventory.assertCheckoutAllowed(item);
            int ownReservation = lines.stream().filter(line -> line.item.id.equals(item.id)).mapToInt(line -> line.preparedQuantity).sum();
            int available = inventory.stock(item).available() + ownReservation;
            if (entry.getValue() > available) throw ApiException.conflict("Insufficient stock to pick up " + item.name);
            var transaction = new StockTransaction();
            transaction.item = item;
            transaction.user = actor;
            transaction.factionOrder = order;
            transaction.type = DomainEnums.TransactionType.checkout;
            transaction.quantity = entry.getValue();
            transaction.reason = "Faction order pickup " + order.orderCode;
            transaction.idempotencyKey = null;
            transaction.persist();
        }
        for (var line : lines) line.pickedUpQuantity = line.preparedQuantity;
    }

    private void replaceLines(FactionOrder order, ApiModels.OrderInput input) {
        FactionOrderLine.delete("order", order);
        int count = 0;
        if (input.requestedQuantities() != null) {
            for (var entry : input.requestedQuantities().entrySet()) {
                if (entry.getValue() == null || entry.getValue() < 1) continue;
                addLine(order, required(Item.class, entry.getKey(), "Item"), null, entry.getValue());
                count++;
            }
        }
        if (input.requestedAssemblyQuantities() != null) {
            for (var entry : input.requestedAssemblyQuantities().entrySet()) {
                if (entry.getValue() == null || entry.getValue() < 1) continue;
                var assembly = required(Assembly.class, entry.getKey(), "Assembly");
                for (var component : AssemblyItem.<AssemblyItem>list("assembly", assembly)) {
                    addLine(order, component.item, assembly, component.quantity * entry.getValue());
                    count++;
                }
            }
        }
        if (count == 0) throw ApiException.badRequest("Add at least one item or assembly to the order");
    }

    private void addLine(FactionOrder order, Item item, Assembly assembly, int quantity) {
        var line = new FactionOrderLine();
        line.order = order;
        line.item = item;
        line.sourceAssembly = assembly;
        line.requestedQuantity = quantity;
        line.persist();
    }

    private void distributePrepared(List<FactionOrderLine> lines, Item item, int quantity) {
        int remaining = quantity;
        for (var line : lines.stream().filter(candidate -> candidate.item.id.equals(item.id)).toList()) {
            line.preparedQuantity = Math.min(line.requestedQuantity, remaining);
            remaining -= line.preparedQuantity;
        }
    }

    private void distributeReturn(List<FactionOrderLine> lines, int returned, int damaged, int missing) {
        int returnLeft = returned;
        int damageLeft = damaged;
        int missingLeft = missing;
        for (var line : lines) {
            int outstanding = line.pickedUpQuantity - line.returnedQuantity - line.damagedQuantity;
            int take = Math.min(outstanding, returnLeft);
            line.returnedQuantity += take;
            line.missingQuantity = Math.max(0, line.missingQuantity - take);
            returnLeft -= take;
            outstanding -= take;
            take = Math.min(outstanding, damageLeft);
            line.damagedQuantity += take;
            line.missingQuantity = Math.max(0, line.missingQuantity - take);
            damageLeft -= take;
            outstanding -= take;
            int declaredMissing = Math.min(outstanding, missingLeft);
            line.missingQuantity = Math.max(line.missingQuantity, declaredMissing);
            missingLeft -= declaredMissing;
        }
    }

    private void createReturnTransaction(Item item, FactionOrder order, UserAccount actor, DomainEnums.TransactionType type,
                                         int quantity, UUID idempotencyKey, String notes) {
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.user = actor;
        transaction.factionOrder = order;
        transaction.type = type;
        transaction.quantity = quantity;
        transaction.reason = "Faction order return " + order.orderCode;
        transaction.notes = notes;
        transaction.idempotencyKey = idempotencyKey;
        transaction.persist();
    }

    private void transition(FactionOrder order, DomainEnums.OrderStatus target, UUID idempotencyKey, String action, String notes, Map<String, Object> delta) {
        var from = order.status;
        if (!TRANSITIONS.getOrDefault(from, Set.of()).contains(target)) throw ApiException.conflict("Invalid order transition: " + from + " -> " + target);
        order.status = target;
        audit(order, actors.current(), action, from, target, idempotencyKey, notes, delta);
    }

    private void audit(FactionOrder order, UserAccount actor, String action, DomainEnums.OrderStatus from,
                       DomainEnums.OrderStatus to, UUID idempotencyKey, String notes, Map<String, Object> delta) {
        var history = new FactionOrderHistory();
        history.order = order;
        history.actor = actor;
        history.action = action;
        history.fromStatus = from == null ? null : from.name();
        history.toStatus = to == null ? null : to.name();
        history.idempotencyKey = idempotencyKey;
        history.notes = notes;
        history.deltaSnapshot = delta;
        history.persist();
    }

    private boolean idempotent(FactionOrder order, UUID key) {
        return key != null && FactionOrderHistory.count("order = ?1 and idempotencyKey = ?2", order, key) > 0;
    }

    private boolean hasOutstanding(FactionOrder order) {
        return FactionOrderLine.<FactionOrderLine>list("order", order).stream()
                .anyMatch(line -> line.pickedUpQuantity > line.returnedQuantity + line.damagedQuantity);
    }

    private Map<Item, Integer> aggregate(List<FactionOrderLine> lines, boolean prepared) {
        var values = new LinkedHashMap<Item, Integer>();
        for (var line : lines) values.merge(line.item, prepared ? line.preparedQuantity : line.requestedQuantity, Integer::sum);
        return values;
    }
    private Map<Item, Integer> aggregatePrepared(List<FactionOrderLine> lines) { return aggregate(lines, true); }
    private Map<Item, Integer> aggregateOutstanding(List<FactionOrderLine> lines) {
        var values = new LinkedHashMap<Item, Integer>();
        for (var line : lines) values.merge(line.item, Math.max(0, line.pickedUpQuantity - line.returnedQuantity - line.damagedQuantity), Integer::sum);
        return values;
    }

    private Map<String, Object> lineSnapshot(FactionOrder order) {
        var rows = new ArrayList<Map<String, Object>>();
        for (var line : FactionOrderLine.<FactionOrderLine>list("order", order)) {
            rows.add(Map.of("itemId", line.item.id, "requested", line.requestedQuantity, "prepared", line.preparedQuantity,
                    "pickedUp", line.pickedUpQuantity, "returned", line.returnedQuantity, "missing", line.missingQuantity, "damaged", line.damagedQuantity));
        }
        return Map.of("lines", rows);
    }

    private String nextOrderCode(EventOccurrence event, Faction faction) {
        String factionPart = faction.slug.replaceAll("[^a-zA-Z0-9]", "").toUpperCase(Locale.ROOT);
        String prefix = event.eventType.toUpperCase(Locale.ROOT) + String.format("%02d", event.startDate.getYear() % 100) + "-" + factionPart + "-";
        long sequence = FactionOrder.count("orderCode like ?1", prefix + "%") + 1;
        return prefix + String.format("%02d", sequence);
    }

    private String actionFor(DomainEnums.OrderStatus status) {
        return switch (status) {
            case submitted -> "submitted";
            case draft -> "submission_reopened";
            case preparing -> "preparation_reopened";
            case ready -> "ready";
            case picked_up -> "picked_up";
            case closed -> "closed";
            case cancelled -> "cancelled";
            default -> status.name();
        };
    }

    private void assertFactionAccess(UserAccount actor, Faction faction) {
        if (actor.role != DomainEnums.UserRole.faction_leader) return;
        String key = faction.eventType + ":" + faction.name;
        if (!actor.factions.contains(faction.name) && !actor.factions.contains(key)) throw ApiException.forbidden("You do not have access to this faction");
    }

    private void createReadyNotification(FactionOrder order) {
        var notification = new Notification();
        notification.recipient = order.createdBy;
        notification.factionOrder = order;
        notification.type = "order_ready";
        var payload = new LinkedHashMap<String, Object>();
        payload.put("orderCode", order.orderCode);
        payload.put("event", order.eventOccurrence.name);
        payload.put("faction", order.faction.name);
        if (order.collectorName != null) payload.put("collectorName", order.collectorName);
        if (order.pickupLocation != null) {
            payload.put("pickupLocation", order.pickupLocation.name);
            if (order.pickupLocation.latitude != null) payload.put("latitude", order.pickupLocation.latitude);
            if (order.pickupLocation.longitude != null) payload.put("longitude", order.pickupLocation.longitude);
        }
        notification.payload = payload;
        notification.persist();
    }

    private FactionOrder lockedOrder(UUID id) {
        var order = entityManager.find(FactionOrder.class, id, LockModeType.PESSIMISTIC_WRITE);
        if (order == null) throw ApiException.notFound("Faction order not found");
        return order;
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = entityManager.find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }
    private String requiredText(String value, String field) { if (value == null || value.isBlank()) throw ApiException.badRequest(field + " is required"); return value; }
    private LocalDate requiredDate(LocalDate value) { if (value == null) throw ApiException.badRequest("eventDate is required"); return value; }
}
