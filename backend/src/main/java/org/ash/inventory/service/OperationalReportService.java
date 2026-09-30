package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiException;
import java.time.*;
import java.util.*;

@ApplicationScoped
public class OperationalReportService {
    private static final int MAX_FILTER_VARIANTS = 64;
    private static final int MAX_CACHED_ROWS = 100000;
    private static final long FILTER_CACHE_SECONDS = 300;
    @Inject org.ash.inventory.orm.OperationalReportOrm orm;
    @Inject ActorService actors;
    @Inject PositionService positions;
    @Inject CustodyBalanceService custody;
    @Inject InventoryOperationsService inventory;
    @Inject ApiQueryService queries;
    private record FilterKey(String name, long version, Instant generation, Map<String, String> filters) {}
    private record Filtered(List<Map<String, Object>> rows, List<Map<String, Object>> monthlyTotals, Instant cachedAt) {}
    private final Map<FilterKey, Filtered> filteredCache = new LinkedHashMap<>(16, 0.75f, true);
    private int cachedRows;
    public static final Map<String, String> DEFINITIONS = new LinkedHashMap<>();
    static {
        DEFINITIONS.put("events", "One row per event/item, including planned-only items. Planned is total forecast; requested is active order demand. Handed over is historical deployment and survives returns. Outstanding = handed over minus good/damaged returns, consumption and write-offs. Missing remains outstanding. Date filter uses event start date.");
        DEFINITIONS.put("availability", "Current bulk/lot positions and individual serialized assets by actual location. Available is unrestricted organization stock; private/external or commitment-required stock needs event-specific planning and is zero here. Ownership is separate from physical on-hand. Available excludes reservations, damage, quarantine, unusable lots and blocked maintenance. Transit and custody (including pending checks) are separate from on-hand. Unlocated legacy quantities are shown as unassigned with zero location availability until reconciled. Inactive locations remain traceable. Date is snapshot date, not historical stock.");
        DEFINITIONS.put("returns", "Unresolved custody by item/person/order/asset. Pending acknowledgement is a subset of outstanding, never subtracted twice. Missing is still outstanding. Date is event end date where attributable; otherwise unknown. This is an unresolved worklist, not historical custody at a selected date.");
        DEFINITIONS.put("repairs", "Open repair cases, excluding returned-to-service and written-off cases, plus unresolved damage incidents not yet assigned a repair case. Repaired and verified cases remain in backlog until release. Quantity is the originating damage quantity for cases and unresolved quantity for incidents. Date is case/incident creation date.");
        DEFINITIONS.put("maintenance", "Active schedules with due/warning/healthy status at generation, plus legacy item calendar dates when no active item schedule exists. Calendar warning windows are days; meter windows use hours or checkout count. Missing meter evidence is unknown, not zero. Date is next calendar due date; meter schedules have no calendar date.");
        DEFINITIONS.put("purchases", "One row per supplier purchase line, including drafts and cancelled orders. Ordered is recorded line quantity; received is delivered quantity. Open delivery excludes draft/cancelled/closed purchases. Value cents = ordered quantity × unit price cents, not paid cost. Filter status before comparing committed spend. Date is order date.");
        DEFINITIONS.put("counts", "Completed counts only (posted/cancelled), so reports cannot reveal expected quantities during a blind count. Original count, recount, approved count and signed variance are retained separately. Date is completion date, or last update for cancelled sessions. Only posted variances changed stock.");
        DEFINITIONS.put("movements", "Immutable consumed and written-off transactions, one row per ledger record. Quantities are positive outcome amounts; they are not summed with event summaries. Unassigned historical events are not guessed. Date is transaction occurrence in UTC. Group by month and type for trends.");
    }
    public record View(String name, String definition, Instant startedAt, Instant generatedAt, boolean stale,
            int total, List<Map<String, Object>> rows, List<Map<String, Object>> monthlyTotals) {}

    @Transactional
    public View read(String name, Map<String, String> filters, int page, int size) {
        if (page < 0 || page > 100000 || size < 1 || size > 200) throw ApiException.badRequest("Invalid report page bounds");
        return readGeneration(name, filters, (long) page * size, size, null);
    }

    @Transactional
    public View export(String name, Map<String, String> filters, Instant generation) {
        if (generation == null) throw ApiException.badRequest("Export requires a report generation");
        return readGeneration(name, filters, 0, Integer.MAX_VALUE, generation);
    }

    private View readGeneration(String name, Map<String, String> filters, long offset, int limit, Instant generation) {
        actors.requireWarehouse(); validate(name);
        validateDates(filters);
        var header = orm.header(name);
        if (generation != null && (header == null || !generation.equals(header.generatedAt())))
            throw ApiException.conflict("Report generation changed during export; restart the export");
        if (header == null) return new View(name, DEFINITIONS.get(name), null, null, true, 0, List.of(), List.of());
        var key = new FilterKey(name, header.version(), header.generatedAt(), Collections.unmodifiableMap(new TreeMap<>(filters)));
        var filtered = cached(key);
        if (filtered == null) {
            var report = orm.find(OperationalReport.class, name);
            if (report == null || report.version != header.version() || !Objects.equals(report.generatedAt, header.generatedAt()))
                throw ApiException.conflict("Report generation changed while reading; reload the report");
            var rows = report.rows.stream().filter(row -> matches(row, filters))
                    .map(row -> Collections.unmodifiableMap(new LinkedHashMap<>(row))).toList();
            filtered = new Filtered(rows, filters.containsKey("itemId") ? monthlyTotals(name, rows) : List.of(), Instant.now());
            cache(key, filtered);
        }
        // Cache only immutable snapshot filtering. Freshness is checked against committed sources on every request.
        int from = (int) Math.min(offset, filtered.rows().size());
        int to = (int) Math.min((long) from + limit, filtered.rows().size());
        return new View(name, DEFINITIONS.get(name), header.startedAt(), header.generatedAt(),
                !Objects.equals(header.sourceToken(), sourceToken()) || header.generatedAt().isBefore(Instant.now().minusSeconds(300)),
                filtered.rows().size(), filtered.rows().subList(from, to), filtered.monthlyTotals());
    }

    private synchronized Filtered cached(FilterKey key) {
        var iterator = filteredCache.entrySet().iterator();
        while (iterator.hasNext()) {
            var entry = iterator.next();
            if (entry.getValue().cachedAt().isBefore(Instant.now().minusSeconds(FILTER_CACHE_SECONDS))) {
                cachedRows -= entry.getValue().rows().size(); iterator.remove();
            }
        }
        return filteredCache.get(key);
    }

    private synchronized void cache(FilterKey key, Filtered value) {
        if (value.rows().size() > MAX_CACHED_ROWS) return;
        var previous = filteredCache.put(key, value);
        if (previous != null) cachedRows -= previous.rows().size();
        cachedRows += value.rows().size();
        var iterator = filteredCache.entrySet().iterator();
        while (filteredCache.size() > MAX_FILTER_VARIANTS || cachedRows > MAX_CACHED_ROWS) {
            cachedRows -= iterator.next().getValue().rows().size(); iterator.remove();
        }
    }

    private List<Map<String, Object>> monthlyTotals(String name, List<Map<String, Object>> rows) {
        if (!Set.of("purchases", "movements").contains(name)) return List.of();
        var grouped = new TreeMap<String, Map<String, Object>>();
        for (var source : rows) {
            String key = source.get("month") + ":" + source.get("status");
            var total = grouped.computeIfAbsent(key, ignored -> row("month", source.get("month"), "status", source.get("status")));
            for (String metric : name.equals("purchases") ? List.of("ordered", "received", "openDelivery", "valueCents") : List.of("quantity"))
                total.put(metric, ((Number) total.getOrDefault(metric, 0L)).longValue() + ((Number) source.getOrDefault(metric, 0)).longValue());
        }
        return grouped.values().stream().map(Collections::unmodifiableMap).toList();
    }

    @Transactional
    public void rebuild(String name) {
        actors.requireWarehouse(); validate(name);
        String before = sourceToken(); Instant start = Instant.now();
        List<Map<String, Object>> rows = switch (name) {
            case "events" -> events(); case "availability" -> availability(); case "returns" -> returns();
            case "repairs" -> repairs(); case "maintenance" -> maintenance(); case "purchases" -> purchases();
            case "counts" -> counts(); case "movements" -> movements(); default -> throw ApiException.badRequest("Unknown report");
        };
        // Never publish a projection assembled while committed source records changed.
        if (!before.equals(sourceToken())) throw ApiException.conflict("Source records changed during rebuild. Retry to obtain a stable report.");
        var report = orm.find(OperationalReport.class, name);
        if (report == null) { report = new OperationalReport(); report.name = name; orm.persist(report); }
        report.rows = rows; report.startedAt = start; report.generatedAt = Instant.now(); report.sourceToken = before;
    }

    private void validate(String name) { if (!DEFINITIONS.containsKey(name)) throw ApiException.notFound("Unknown report"); }
    private String sourceToken() {
        var token = new StringBuilder(LocalDate.now(ZoneOffset.UTC).toString());
        // Sort explicitly: SQL UNION result order is not guaranteed.
        var values = new ArrayList<>(orm.watermarks());
        values.sort(Comparator.comparing(row -> (String) row[0]));
        for (var row : values) {
            token.append('|').append(row[0]).append(':').append(row[1]).append(':').append(row[2]);
        }
        return token.toString();
    }
    private <T> List<T> all(Class<T> type) { return orm.all(type); }
    private Map<String, Object> row(Object... pairs) {
        var result = new LinkedHashMap<String, Object>();
        for (int i = 0; i < pairs.length; i += 2) {
            Object value = pairs[i + 1];
            result.put(pairs[i].toString(), value instanceof Number || value instanceof Boolean || value == null ? value : value.toString());
        }
        return result;
    }
    private void item(Map<String, Object> row, Item item) {
        row.put("itemId", item == null ? null : item.id.toString()); row.put("item", item == null ? "Unknown item" : item.name); row.put("category", item == null ? null : item.category);
    }
    private void location(Map<String, Object> row, StorageLocation location) {
        row.put("locationId", location == null ? null : location.id.toString()); row.put("location", location == null ? "Unassigned" : location.name);
        row.put("warehouseId", location == null || location.warehouse == null ? null : location.warehouse.id.toString());
        row.put("warehouse", location == null || location.warehouse == null ? "Unassigned" : location.warehouse.name);
        row.put("locationActive", location != null && location.active);
    }
    private List<Map<String, Object>> events() {
        var rows = new ArrayList<Map<String, Object>>();
        var events = all(EventOccurrence.class);
        var views = queries.projectEvents(events);
        var items = all(Item.class).stream().collect(java.util.stream.Collectors.toMap(i -> i.id, i -> i));
        for (int index = 0; index < events.size(); index++) {
            var event = events.get(index);
            var view = views.get(index);
            for (String id : view.itemIds()) {
                var row = row("id", event.id + ":" + id, "eventId", event.id, "event", event.name, "date", event.startDate, "status", event.status, "planned", view.plannedQuantities().getOrDefault(id, 0));
                item(row, items.get(UUID.fromString(id)));
                view.quantities().forEach((metric, values) -> row.put(metric, values.getOrDefault(id, 0)));
                rows.add(row);
            }
        }
        return rows;
    }
    private List<Map<String, Object>> availability() {
        var rows = new ArrayList<Map<String, Object>>();
        var items = all(Item.class);
        var stock = inventory.readStock(items);
        var orderedPositions = stock.values().stream().flatMap(s -> s.policy().positions().stream()).toList();
        var reservations = positions.reservedAt(items, orderedPositions);
        var located = new HashMap<UUID, Integer>();
        for (var p : orderedPositions) {
            if (p.item.trackingMode == DomainEnums.TrackingMode.serialized) continue;
            located.merge(p.item.id, p.quantityOnHand, Integer::sum);
            int reserved = reservations.getOrDefault(p.id, 0);
            var row = row("id", p.id, "date", LocalDate.now(ZoneOffset.UTC), "tracking", p.item.trackingMode, "lot", p.lot == null ? null : p.lot.lotNumber,
                    "onHand", p.quantityOnHand, "reserved", reserved, "damaged", p.quantityDamaged, "quarantined", p.quantityQuarantined,
                    "inTransit", p.quantityInTransit, "ownership", p.item.ownershipType, "owner", p.item.ownerName,
                    "available", !EquipmentService.freelyAvailable(p.item) || !stock.get(p.item.id).policy().itemUsable() ? 0 : Math.max(0, p.availableQuantity() - reserved));
            item(row, p.item); location(row, p.location); rows.add(row);
        }
        for (var item : items) {
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) continue;
            int unlocated = Math.max(0, stock.get(item.id).physical().onHand() - located.getOrDefault(item.id, 0));
            if (unlocated == 0) continue;
            var row = row("id", item.id + ":unlocated", "date", LocalDate.now(ZoneOffset.UTC), "tracking", item.trackingMode,
                    "status", "location_reconciliation_required", "ownership", item.ownershipType, "owner", item.ownerName, "onHand", unlocated, "available", 0);
            item(row, item); location(row, null); rows.add(row);
        }
        for (var a : all(AssetInstance.class)) {
            var state = StockPolicy.classify(a);
            var policy = stock.get(a.item.id).policy();
            boolean available = state.available() > 0 && a.currentLocation != null && EquipmentService.freelyAvailable(a.item) && policy.itemUsable() && policy.usable(a);
            var row = row("id", a.id, "date", LocalDate.now(ZoneOffset.UTC), "tracking", "serialized", "asset", a.assetCode, "status", a.availabilityStatus,
                    "ownership", a.item.ownershipType, "owner", a.item.ownerName,
                    "onHand", state.onHand(), "available", available ? 1 : 0, "reserved", state.reserved(),
                    "damaged", state.damaged(), "inTransit", state.inTransit(), "outstanding", state.checkedOut());
            item(row, a.item); location(row, a.currentLocation); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> returns() {
        var rows = new ArrayList<Map<String, Object>>();
        var events = all(EventOccurrence.class).stream().collect(java.util.stream.Collectors.toMap(e -> e.id, e -> e));
        var items = all(Item.class).stream().collect(java.util.stream.Collectors.toMap(i -> i.id, i -> i));
        for (var balance : custody.list(false)) {
            var event = balance.eventOccurrenceId() == null ? null : events.get(balance.eventOccurrenceId());
            var row = row("id", balance.key(), "person", balance.person(), "eventId", balance.eventOccurrenceId(), "event", balance.event(),
                    "date", event == null ? null : event.endDate, "outstanding", balance.checkedOut(), "pendingAcknowledgement", balance.pendingQuantity(),
                    "factionOrderId", balance.factionOrderId(), "generalOrderId", balance.generalOrderId(), "assetId", balance.assetInstanceId(), "expectedReturnLocation", balance.storageLocation());
            item(row, items.get(balance.itemId())); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> repairs() {
        var rows = new ArrayList<Map<String, Object>>();
        var assigned = new HashSet<UUID>();
        for (var r : all(RepairCase.class)) {
            assigned.add(r.damageReport.id);
            if (Set.of(DomainEnums.RepairStatus.returned_to_service, DomainEnums.RepairStatus.written_off).contains(r.status)) continue;
            var row = row("id", r.id, "date", r.createdAt.atOffset(ZoneOffset.UTC).toLocalDate(), "status", r.status, "quantity", r.damageReport.quantity,
                    "owner", r.repairOwner == null ? null : r.repairOwner.name, "vendor", r.repairVendor == null ? null : r.repairVendor.name,
                    "asset", r.assetInstance == null ? null : r.assetInstance.assetCode, "safetyImpact", r.safetyImpact, "partsAndCostNotes", r.partsAndCostNotes, "verification", r.verificationResult);
            item(row, r.damageReport.item); if (r.assetInstance != null) location(row, r.assetInstance.currentLocation); rows.add(row);
        }
        for (var damage : all(DamageReport.class)) {
            if (assigned.contains(damage.id) || Set.of(DomainEnums.DamageStatus.resolved, DomainEnums.DamageStatus.returned_to_service, DomainEnums.DamageStatus.written_off).contains(damage.status)) continue;
            int outstanding = Math.max(0, damage.quantity - damage.repairedQuantity - damage.writtenOffQuantity);
            if (outstanding == 0) continue;
            var row = row("id", damage.id, "date", damage.createdAt.atOffset(ZoneOffset.UTC).toLocalDate(), "status", "awaiting_triage", "quantity", outstanding,
                    "assembly", damage.assembly == null ? null : damage.assembly.name, "safetyImpact", damage.safetyImpact, "notes", damage.description);
            item(row, damage.item); if (damage.assetInstance != null) location(row, damage.assetInstance.currentLocation); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> maintenance() {
        var rows = new ArrayList<Map<String, Object>>();
        var items = all(Item.class);
        var facts = inventory.readStock(items);
        var scheduledItems = new HashSet<UUID>();
        for (var s : all(MaintenanceSchedule.class)) {
            if (!s.active) continue;
            if (s.assetInstance == null) scheduledItems.add(s.item.id);
            var policy = facts.get(s.item.id).policy();
            var row = row("id", s.id, "date", s.nextDueAt == null ? null : s.nextDueAt.atOffset(ZoneOffset.UTC).toLocalDate(), "status", policy.status(s),
                    "type", s.maintenanceType, "interval", s.intervalType, "nextDue", s.nextDueValue, "meter", s.intervalType == DomainEnums.MaintenanceIntervalType.date ? null : MaintenancePolicy.meter(MaintenancePolicy.facts(s), policy.counters(s)),
                    "warningWindow", s.warningWindow, "blocking", s.checkoutBlocking, "asset", s.assetInstance == null ? null : s.assetInstance.assetCode,
                    "responsible", s.responsiblePerson == null ? null : s.responsiblePerson.name);
            item(row, s.item); if (s.assetInstance != null) location(row, s.assetInstance.currentLocation); rows.add(row);
        }
        for (var item : items) {
            if (!item.active || scheduledItems.contains(item.id) || (item.nextMaintenanceDue == null && item.maintenanceStatus != DomainEnums.MaintenanceStatus.in_service)) continue;
            String status = item.maintenanceStatus == DomainEnums.MaintenanceStatus.in_service ? "in_service"
                    : item.nextMaintenanceDue.isBefore(LocalDate.now()) ? "due" : !item.nextMaintenanceDue.isAfter(LocalDate.now().plusDays(30)) ? "warning" : "healthy";
            var row = row("id", item.id + ":calendar", "date", item.nextMaintenanceDue, "status", status, "type", "item_calendar", "interval", "date", "warningWindow", 30, "blocking", true);
            item(row, item); location(row, item.storageLocation); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> purchases() {
        var rows = new ArrayList<Map<String, Object>>();
        for (var line : all(PurchaseOrderLine.class)) {
            var p = line.purchaseOrder;
            var row = row("id", line.id, "date", p.orderDate, "month", p.orderDate.toString().substring(0, 7), "purchase", p.orderNumber, "supplier", p.vendor.name,
                    "eventId", p.eventOccurrence == null ? null : p.eventOccurrence.id, "status", p.status, "expectedDelivery", p.expectedDeliveryDate,
                    "ordered", line.orderedQuantity, "received", line.receivedQuantity,
                    "openDelivery", Set.of(DomainEnums.PurchaseOrderStatus.ordered, DomainEnums.PurchaseOrderStatus.partially_received).contains(p.status) ? line.remainingQuantity() : 0,
                    "valueCents", (long) line.orderedQuantity * line.unitPriceCents);
            item(row, line.item); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> counts() {
        var rows = new ArrayList<Map<String, Object>>();
        for (var line : all(InventoryCountLine.class)) {
            if (!Set.of(DomainEnums.CountStatus.posted, DomainEnums.CountStatus.cancelled).contains(line.session.status)) continue;
            var date = line.session.completedAt == null ? line.session.updatedAt : line.session.completedAt;
            var row = row("id", line.id, "date", date.atOffset(ZoneOffset.UTC).toLocalDate(), "session", line.session.sessionNumber, "status", line.session.status,
                    "expected", line.expectedQuantity, "counted", line.countedQuantity, "recounted", line.recountedQuantity, "approved", line.approvedQuantity, "variance", line.varianceQuantity);
            item(row, line.item); location(row, line.location); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> movements() {
        var rows = new ArrayList<Map<String, Object>>();
        for (var tx : orm.outcomeMovements()) {
            var row = row("id", tx.id, "date", tx.occurredAt.atOffset(ZoneOffset.UTC).toLocalDate(), "month", tx.occurredAt.toString().substring(0, 7),
                    "status", tx.type, "quantity", tx.quantity, "eventId", tx.eventOccurrence == null ? null : tx.eventOccurrence.id,
                    "event", tx.eventOccurrence == null ? "Unassigned historical movement" : tx.eventOccurrence.name, "reason", tx.reason, "actor", tx.user.name);
            item(row, tx.item); location(row, tx.sourceLocation); rows.add(row);
        }
        return rows;
    }
    private void validateDates(Map<String, String> filters) {
        try {
            LocalDate from = filters.containsKey("from") ? LocalDate.parse(filters.get("from")) : null;
            LocalDate to = filters.containsKey("to") ? LocalDate.parse(filters.get("to")) : null;
            if (from != null && to != null && from.isAfter(to)) throw ApiException.badRequest("Start date must not follow end date");
        } catch (java.time.format.DateTimeParseException e) { throw ApiException.badRequest("Use YYYY-MM-DD dates"); }
    }
    private boolean matches(Map<String, Object> row, Map<String, String> filters) {
        for (var entry : filters.entrySet()) {
            String value = entry.getValue(); if (value == null || value.isBlank()) continue;
            if (entry.getKey().equals("search")) {
                if (row.values().stream().noneMatch(v -> v != null && v.toString().toLowerCase(Locale.ROOT).contains(value.toLowerCase(Locale.ROOT)))) return false;
            } else if (entry.getKey().equals("from") || entry.getKey().equals("to")) {
                Object date = row.get("date"); if (date == null) return false;
                int compare = date.toString().compareTo(value);
                if (entry.getKey().equals("from") ? compare < 0 : compare > 0) return false;
            } else if (!Objects.equals(Objects.toString(row.get(entry.getKey()), ""), value)) return false;
        }
        return true;
    }
}
