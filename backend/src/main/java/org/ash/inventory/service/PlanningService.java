package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.PlanningOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.ApiResponses;
import java.time.LocalDate;
import java.util.*;

@ApplicationScoped
public class PlanningService {
    private final PlanningOrm orm;
    private final PlanningStockService stockSnapshots;
    private final ActorService actors;
    private final DomainEventService events;
    public PlanningService(PlanningOrm orm, PlanningStockService stockSnapshots, ActorService actors, DomainEventService events) {
        this.orm = orm; this.stockSnapshots = stockSnapshots; this.actors = actors; this.events = events;
    }
    public record OverrideInput(UUID eventId, UUID itemId, int quantity, String reason) {}
    @Transactional
    public void override(OverrideInput input) {
        actors.requirePlanner();
        if (input.eventId() == null || input.itemId() == null || input.quantity() < 0 || input.reason() == null || input.reason().isBlank()) throw ApiException.badRequest("Event, item, non-negative forecast and reason are required");
        var event = orm.find(EventOccurrence.class, input.eventId()); var item = orm.find(Item.class, input.itemId());
        if (event == null || item == null) throw ApiException.notFound("Event or item not found");
        var override = new PlanningOverride(); override.event = event; override.item = item; override.actor = actors.current(); override.quantity = input.quantity(); override.reason = input.reason().trim(); orm.persist(override);
        events.record("planning.overridden", "event", event.id, actors.current().id, null, Map.of("itemId", item.id.toString(), "quantity", input.quantity(), "reason", override.reason));
    }

    @Transactional
    public List<ApiResponses.DeficitResponse> deficits(UUID eventId) {
        actors.requirePlanner();
        var scope = orm.events();
        EventOccurrence selected = eventId == null ? null : orm.find(EventOccurrence.class, eventId);
        if (eventId != null && selected == null) throw ApiException.notFound("Event not found");
        if (selected != null) scope = scope.stream().filter(e -> !e.startDate.isAfter(selected.endDate.plusDays(1))).toList();
        var selectedIds = scope.stream().map(e -> e.id).collect(java.util.stream.Collectors.toSet());
        var demand = new HashMap<UUID, Map<UUID, Integer>>();
        var handedOver = new HashMap<UUID, Map<UUID, Integer>>();
        var reservations = new HashMap<UUID, Integer>();
        for (var line : orm.lines()) {
            if (!selectedIds.contains(line.order.eventOccurrence.id)) continue;
            handedOver.computeIfAbsent(line.order.eventOccurrence.id, ignored -> new HashMap<>()).merge(line.item.id, line.handedOverQuantity, Integer::sum);
            if (List.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready).contains(line.order.status))
                demand.computeIfAbsent(line.order.eventOccurrence.id, ignored -> new HashMap<>()).merge(line.item.id, line.requestedQuantity, Integer::sum);
            reservations.merge(line.item.id, line.reservedQuantity, Integer::sum);
        }
        for (var order : orm.generalOrders()) {
            if (order.eventOccurrence == null || !selectedIds.contains(order.eventOccurrence.id)) continue;
            var map = demand.computeIfAbsent(order.eventOccurrence.id, ignored -> new HashMap<>());
            var handed = handedOver.computeIfAbsent(order.eventOccurrence.id, ignored -> new HashMap<>());
            order.handedOverQuantities.forEach((id, quantity) -> handed.merge(UUID.fromString(id), quantity, Integer::sum));
            if (List.of("draft", "submitted", "preparing", "ready").contains(order.status)) order.requestedQuantities.forEach((id, quantity) -> map.merge(UUID.fromString(id), quantity, Integer::sum));
            if (List.of("preparing", "ready").contains(order.status)) order.preparedQuantities.forEach((id, quantity) -> reservations.merge(UUID.fromString(id), quantity, Integer::sum));
        }
        var overrides = new HashMap<String, PlanningOverride>();
        orm.overrides().forEach(o -> overrides.put(o.event.id + ":" + o.item.id, o));
        var incoming = orm.incoming(); var items = orm.items(); var stocks = stockSnapshots.load(items);
        var incomingByItem = new HashMap<UUID, List<PurchaseOrderLine>>();
        incoming.forEach(line -> incomingByItem.computeIfAbsent(line.item.id, ignored -> new ArrayList<>()).add(line));
        var dates = new TreeSet<LocalDate>(); scope.forEach(e -> { if (selected == null || !e.startDate.isBefore(selected.startDate)) dates.add(e.startDate); });
        if (selected != null) dates.add(selected.startDate);
        if (dates.isEmpty()) dates.add(LocalDate.now());
        var result = new ArrayList<ApiResponses.DeficitResponse>();
        for (var item : items) {
            var snapshot = stocks.get(item.id);
            var stock = snapshot.stock();
            boolean conditional = !EquipmentService.freelyAvailable(item);
            var physical = snapshot.physical();
            int creditedReservations = Math.min(stock.reserved(), reservations.getOrDefault(item.id, 0));
            int usable = conditional ? 0 : stock.available() + creditedReservations;
            int maxNeed = -1, demandAtPeak = 0, receiptAtPeak = 0, grossAtPeak = 0, committedAtPeak = 0; LocalDate requiredDate = dates.first();
            var itemIncoming = incomingByItem.getOrDefault(item.id, List.of());
            int allIncoming = itemIncoming.stream().mapToInt(PurchaseOrderLine::remainingQuantity).sum();
            for (var date : dates) {
                int needed = 0, committed = 0;
                int capacity = physical.available() + creditedReservations;
                for (var event : scope) {
                    // Reusable equipment is assumed ready the day after the event ends.
                    if (event.startDate.isAfter(date) || (!item.consumable && event.endDate.plusDays(1).isBefore(date))) continue;
                    var override = overrides.get(event.id + ":" + item.id);
                    int forecast = override == null ? (event.plannedQuantities == null ? 0 : event.plannedQuantities.getOrDefault(item.id.toString(), 0)) : override.quantity;
                    forecast = Math.max(0, forecast - handedOver.getOrDefault(event.id, Map.of()).getOrDefault(item.id, 0));
                    int eventNeed = Math.max(forecast, demand.getOrDefault(event.id, Map.of()).getOrDefault(item.id, 0));
                    needed += eventNeed;
                    if (conditional) {
                        int supply = Math.min(eventNeed, Math.min(capacity, stockSnapshots.availableFor(snapshot, event, creditedReservations)));
                        committed += supply; capacity -= supply;
                    }
                }
                int due = itemIncoming.stream().filter(line -> line.purchaseOrder.expectedDeliveryDate != null && !line.purchaseOrder.expectedDeliveryDate.isAfter(date)).mapToInt(PurchaseOrderLine::remainingQuantity).sum();
                // Purchasing alone cannot create an owner's consent for restricted stock.
                if (conditional) due = 0;
                int gross = Math.max(0, needed + item.minStock - usable - committed);
                int net = Math.max(0, gross - due);
                if (net > maxNeed || (net == maxNeed && gross > grossAtPeak)) { maxNeed = net; demandAtPeak = needed; receiptAtPeak = due; grossAtPeak = gross; requiredDate = date; committedAtPeak = committed; }
            }
            if (grossAtPeak == 0) continue;
            var override = selected == null ? null : overrides.get(selected.id + ":" + item.id);
            result.add(new ApiResponses.DeficitResponse(item.id, item.sku, item.name, item.category, item.supplier == null ? "Unassigned" : item.supplier, item.consumable ? "consumable" : "asset", demandAtPeak, stock.onHand(), item.ownershipType == Item.Ownership.organization ? stock.totalOwned() : 0, stock.available(), stock.reserved(), usable + committedAtPeak - demandAtPeak, grossAtPeak, receiptAtPeak, conditional ? "obtain_commitment" : item.consumable ? "purchase" : "rent_or_purchase", requiredDate, Math.max(0, allIncoming - receiptAtPeak), item.minStock, override == null ? null : override.reason, override == null ? null : override.actor.name, committedAtPeak));
        }
        result.sort(Comparator.comparingInt((ApiResponses.DeficitResponse row) -> row.netDeficit() - row.orderedStock()).reversed());
        return result;
    }
}
