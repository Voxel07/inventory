package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DamageReport;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.InventoryCountLine;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;
import org.ash.inventory.operations.internal.model.PurchaseOrderLine;
import org.ash.inventory.operations.internal.model.RepairCase;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.ReportSourceOrm;
import org.ash.inventory.operations.internal.persistence.SourceRevisionOrm;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.BusinessTime;
import org.ash.inventory.platform.persistence.ConsistentRead;
import org.ash.inventory.reporting.api.ReportDefinitions;
import org.ash.inventory.reporting.api.ReportSource;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.*;
import java.util.*;
/** Owner-side report facts; no HTTP context, response mapping, job queue or reporting persistence. */
@ApplicationScoped
public class OperationalReportSource implements ReportSource {
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.StockReadService stockReads;
    @Inject org.ash.inventory.operations.internal.persistence.ReportSourceOrm orm;
    @Inject PositionService positions;
    @Inject CustodyBalanceService custody;
    @Inject EventMetricsService eventMetrics;
    @Inject org.ash.inventory.operations.internal.persistence.SourceRevisionOrm revisions;
    @org.eclipse.microprofile.config.inject.ConfigProperty(name="inventory.reports.max-output-rows",defaultValue="25000") int maxOutputRows;
    @Transactional
    public String token(String name) { validate(name); return revisions.reportToken(name); }
    @org.ash.inventory.platform.persistence.ConsistentRead
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Snapshot build(String name) {
        validate(name);orm.assertBudget(name);String before=revisions.reportToken(name);Instant start=Instant.now();
        List<Map<String,Object>> rows=switch(name){
            case "events" -> events();case "availability" -> availability();case "returns" -> returns();case "repairs" -> repairs();
            case "maintenance" -> maintenance();case "purchases" -> purchases();case "counts" -> counts();case "movements" -> movements();
            default -> throw ApiException.notFound("Unknown report");
        };
        return new Snapshot(before,start,Instant.now(),rows);
    }
    private void validate(String name){if(!ReportDefinitions.all().containsKey(name))throw ApiException.notFound("Unknown report");}
    private static final class BoundedRows extends ArrayList<Map<String,Object>> {
        private final int limit;
        BoundedRows(int limit){if(limit<1)throw new IllegalArgumentException("Invalid report row limit");this.limit=limit;}
        @Override public boolean add(Map<String,Object> row){if(size()>=limit)throw new ApiException(413,"Report exceeds its row budget");return super.add(row);}
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
        // The top-level location (site) the stock belongs to, e.g. Betriebshof.
        var site = location == null ? null : location.root();
        row.put("siteId", site == null ? null : site.id.toString());
        row.put("site", site == null ? "Unassigned" : site.name);
        row.put("locationActive", location != null && location.active);
    }
    private List<Map<String, Object>> events() {
        var rows = new BoundedRows(maxOutputRows);
        var events = all(EventOccurrence.class);
        var views = eventMetrics.summarize(events);
        var items = all(Item.class).stream().collect(java.util.stream.Collectors.toMap(i -> i.id, i -> i));
        for (int index = 0; index < events.size(); index++) {
            var event = events.get(index);
            var view = views.get(event.id);
            for (String id : view.itemIds()) {
                var row = row("id", event.id + ":" + id, "eventId", event.id, "event", event.name, "date", event.startDate, "status", event.status, "planned", view.planned().getOrDefault(id, 0));
                item(row, items.get(UUID.fromString(id)));
                view.quantities().forEach((metric, values) -> row.put(metric, values.getOrDefault(id, 0)));
                rows.add(row);
            }
        }
        return rows;
    }
    private List<Map<String, Object>> availability() {
        var rows = new BoundedRows(maxOutputRows);
        var items = all(Item.class);
        var stock = stockReads.readStock(items);
        var orderedPositions = stock.values().stream().flatMap(s -> s.policy().positions().stream()).toList();
        var reservations = positions.reservedAt(items, orderedPositions);
        var located = new HashMap<UUID, Integer>();
        for (var p : orderedPositions) {
            if (p.item.trackingMode == DomainEnums.TrackingMode.serialized) continue;
            located.merge(p.item.id, p.quantityOnHand, Integer::sum);
            int reserved = reservations.getOrDefault(p.id, 0);
            var row = row("id", p.id, "date", BusinessTime.today(), "tracking", p.item.trackingMode, "lot", p.lot == null ? null : p.lot.lotNumber,
                    "onHand", p.quantityOnHand, "reserved", reserved, "damaged", p.quantityDamaged, "quarantined", p.quantityQuarantined,
                    "inTransit", p.quantityInTransit, "ownership", p.item.ownershipType, "owner", p.item.ownerName,
                    "available", !EquipmentPolicy.freelyAvailable(p.item) || !stock.get(p.item.id).policy().eligible() ? 0 : Math.max(0, p.availableQuantity() - reserved));
            item(row, p.item); location(row, p.location); rows.add(row);
        }
        for (var item : items) {
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) continue;
            int unlocated = Math.max(0, stock.get(item.id).physical().onHand() - located.getOrDefault(item.id, 0));
            if (unlocated == 0) continue;
            var row = row("id", item.id + ":unlocated", "date", BusinessTime.today(), "tracking", item.trackingMode,
                    "status", "location_reconciliation_required", "ownership", item.ownershipType, "owner", item.ownerName, "onHand", unlocated, "available", 0);
            item(row, item); location(row, null); rows.add(row);
        }
        for (var a : all(AssetInstance.class)) {
            var state = StockPolicy.classify(a);
            var policy = stock.get(a.item.id).policy();
            boolean available = state.available() > 0 && a.currentLocation != null && EquipmentPolicy.freelyAvailable(a.item) && policy.eligible() && policy.usable(a);
            var row = row("id", a.id, "date", BusinessTime.today(), "tracking", "serialized", "asset", a.assetCode, "status", a.availabilityStatus,
                    "ownership", a.item.ownershipType, "owner", a.item.ownerName,
                    "onHand", state.onHand(), "available", available ? 1 : 0, "reserved", state.reserved(),
                    "damaged", state.damaged(), "inTransit", state.inTransit(), "outstanding", state.checkedOut());
            item(row, a.item); location(row, a.currentLocation); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> returns() {
        var rows = new BoundedRows(maxOutputRows);
        var events = all(EventOccurrence.class).stream().collect(java.util.stream.Collectors.toMap(e -> e.id, e -> e));
        var items = all(Item.class).stream().collect(java.util.stream.Collectors.toMap(i -> i.id, i -> i));
        for (var balance : custody.reportSnapshot()) {
            var event = balance.eventOccurrenceId() == null ? null : events.get(balance.eventOccurrenceId());
            var row = row("id", balance.key(), "person", balance.person(), "eventId", balance.eventOccurrenceId(), "event", balance.event(),
                    "date", event == null ? null : event.endDate, "outstanding", balance.checkedOut(), "pendingAcknowledgement", balance.pendingQuantity(),
                    "orderId", balance.orderId(), "orderKind", balance.orderKind() == null ? null : balance.orderKind().name(), "assetId", balance.assetInstanceId(), "expectedReturnLocation", balance.storageLocation());
            var heldItem = items.get(balance.itemId());
            var returnLocation = heldItem.returnLocation == null ? heldItem.storageLocation : heldItem.returnLocation;
            row.put("locationId", returnLocation == null ? null : returnLocation.id.toString());
            row.put("expectedReturnLocation", returnLocation == null ? null : returnLocation.name);
            item(row, heldItem); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> repairs() {
        var rows = new BoundedRows(maxOutputRows);
        var assigned = new HashSet<UUID>();
        for (var r : all(RepairCase.class)) {
            assigned.add(r.damageReport.id);
            if (Set.of(DomainEnums.RepairStatus.returned_to_service, DomainEnums.RepairStatus.written_off).contains(r.status)) continue;
            var row = row("id", r.id, "date", BusinessTime.date(r.createdAt), "status", r.status, "quantity", r.damageReport.quantity,
                    "owner", r.repairOwner == null ? null : r.repairOwner.name, "vendor", r.repairVendor == null ? null : r.repairVendor.name,
                    "asset", r.assetInstance == null ? null : r.assetInstance.assetCode, "safetyImpact", r.safetyImpact, "partsAndCostNotes", r.partsAndCostNotes, "verification", r.verificationResult);
            row.put("assemblyId", r.damageReport.assembly == null ? null : r.damageReport.assembly.id);
            item(row, r.damageReport.item); if (r.assetInstance != null) location(row, r.assetInstance.currentLocation); rows.add(row);
        }
        for (var damage : all(DamageReport.class)) {
            if (assigned.contains(damage.id) || Set.of(DomainEnums.DamageStatus.resolved, DomainEnums.DamageStatus.returned_to_service, DomainEnums.DamageStatus.written_off).contains(damage.status)) continue;
            int outstanding = Math.max(0, damage.quantity - damage.repairedQuantity - damage.writtenOffQuantity);
            if (outstanding == 0) continue;
            var row = row("id", damage.id, "date", BusinessTime.date(damage.createdAt), "status", "awaiting_triage", "quantity", outstanding,
                    "assembly", damage.assembly == null ? null : damage.assembly.name, "safetyImpact", damage.safetyImpact, "notes", damage.description);
            row.put("assemblyId", damage.assembly == null ? null : damage.assembly.id);
            item(row, damage.item); if (damage.assetInstance != null) location(row, damage.assetInstance.currentLocation); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> maintenance() {
        var rows = new BoundedRows(maxOutputRows);
        var items = all(Item.class);
        var facts = stockReads.readStock(items);
        var scheduledItems = new HashSet<UUID>();
        for (var s : all(MaintenanceSchedule.class)) {
            if (!s.active) continue;
            if (s.assetInstance == null) scheduledItems.add(s.item.id);
            var policy = facts.get(s.item.id).policy();
            var row = row("id", s.id, "date", s.nextDueAt == null ? null : BusinessTime.date(s.nextDueAt), "status", policy.status(s),
                    "type", s.maintenanceType, "interval", s.intervalType, "nextDue", s.nextDueValue, "meter", s.intervalType == DomainEnums.MaintenanceIntervalType.date ? null : MaintenancePolicy.meter(MaintenancePolicy.facts(s), policy.counters(s)),
                    "warningWindow", s.warningWindow, "blocking", s.checkoutBlocking, "asset", s.assetInstance == null ? null : s.assetInstance.assetCode,
                    "responsible", s.responsiblePerson == null ? null : s.responsiblePerson.name);
            item(row, s.item); if (s.assetInstance != null) location(row, s.assetInstance.currentLocation); rows.add(row);
        }
        var today = BusinessTime.today();
        for (var item : items) {
            if (!item.active) continue;
            if (item.outOfService) {
                var row = row("id", item.id + ":calendar", "date", null,
                        "status", calendarReportStatus(MaintenancePolicy.itemStatus(item, today)), "type", "item_calendar",
                        "interval", "date", "warningWindow", MaintenancePolicy.CALENDAR_WARNING_DAYS, "blocking", true);
                item(row, item); location(row, item.storageLocation); rows.add(row);
            }
            if (item.trackingMode != DomainEnums.TrackingMode.serialized) continue;
            for (var asset : facts.get(item.id).policy().assets()) {
                if (!asset.outOfService) continue;
                var row = row("id", asset.id + ":calendar", "date", null,
                        "status", calendarReportStatus(MaintenancePolicy.assetStatus(asset, today)), "type", "asset_calendar",
                        "interval", "date", "warningWindow", MaintenancePolicy.CALENDAR_WARNING_DAYS, "blocking", true,
                        "asset", asset.assetCode);
                item(row, item); location(row, asset.currentLocation); rows.add(row);
            }
        }
        return rows;
    }
    private static String calendarReportStatus(DomainEnums.MaintenanceStatus status) {
        return switch (status) {
            case in_service -> "in_service";
            case overdue -> "due";
            case due_soon -> "warning";
            case certified -> "healthy";
        };
    }
    private List<Map<String, Object>> purchases() {
        var rows = new BoundedRows(maxOutputRows);
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
        var rows = new BoundedRows(maxOutputRows);
        for (var line : all(InventoryCountLine.class)) {
            if (!Set.of(DomainEnums.CountStatus.posted, DomainEnums.CountStatus.cancelled).contains(line.session.status)) continue;
            var date = line.session.completedAt == null ? line.session.updatedAt : line.session.completedAt;
            var row = row("id", line.id, "date", BusinessTime.date(date), "session", line.session.sessionNumber, "status", line.session.status,
                    "expected", line.expectedQuantity, "counted", line.countedQuantity, "recounted", line.recountedQuantity, "approved", line.approvedQuantity, "variance", line.varianceQuantity);
            item(row, line.item); location(row, line.location); rows.add(row);
        }
        return rows;
    }
    private List<Map<String, Object>> movements() {
        var rows = new BoundedRows(maxOutputRows);
        for (var tx : orm.outcomeMovements()) {
            var row = row("id", tx.id, "date", BusinessTime.date(tx.occurredAt), "month", BusinessTime.date(tx.occurredAt).toString().substring(0, 7),
                    "status", tx.type, "quantity", tx.quantity, "eventId", tx.eventOccurrence == null ? null : tx.eventOccurrence.id,
                    "event", tx.eventOccurrence == null ? "Unassigned historical movement" : tx.eventOccurrence.name, "reason", tx.reason, "actor", tx.user.name);
            item(row, tx.item); location(row, tx.sourceLocation); rows.add(row);
        }
        return rows;
    }
}
