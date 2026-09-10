package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.OperationsOrm;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class InventoryOperationsService {
    @Inject
    OperationsOrm orm;
    @Inject
    ActorService actors;
    @Inject DomainEventService events;

    public record StockState(int onHand, int checkedOut, int damaged, int reserved, int available) {
        public int totalOwned() {
            return onHand + checkedOut;
        }
    }

    @Transactional
    public StockTransaction transact(ApiModels.TransactionInput input) {
        var actor = actors.current();
        if (input.transactionType() == DomainEnums.TransactionType.repaired
                || input.transactionType() == DomainEnums.TransactionType.written_off) {
            throw ApiException.badRequest("Damage resolution transactions must be created from a damage report");
        }
        if (input.factionOrderId() != null) {
            throw ApiException.badRequest("Order-linked stock changes must use the faction order workflow");
        }
        if (input.idempotencyKey() != null) {
            var existing = orm.transactionByIdempotencyKey(input.idempotencyKey());
            if (existing != null)
                return existing;
        }
        var item = lockedItem(input.itemId());
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            throw ApiException.conflict("Serialized items require an asset-specific inventory transaction");
        }
        var state = stock(item);
        if (input.transactionType() == DomainEnums.TransactionType.checkout) {
            requiredText(input.eventType(), "eventType");
            requiredText(input.faction(), "faction");
            assertCheckoutAllowed(item);
            if (input.quantityChanged() > state.available())
                throw ApiException.conflict("Only " + state.available() + " units are available");
        }
        if (input.transactionType() == DomainEnums.TransactionType.checkin
                && input.quantityChanged() > state.checkedOut()) {
            throw ApiException.conflict("Only " + state.checkedOut() + " units are checked out");
        }
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.user = input.userId() == null ? actor : required(UserAccount.class, input.userId(), "User");
        transaction.type = input.transactionType();
        transaction.quantity = input.quantityChanged();
        transaction.reason = input.reason();
        transaction.notes = input.notes();
        transaction.eventType = blankToNull(input.eventType());
        transaction.faction = blankToNull(input.faction());
        transaction.idempotencyKey = input.idempotencyKey();
        transaction.clientCommandId = input.idempotencyKey();
        switch (input.transactionType()) {
            case added, received, adjusted, checkin, transfer_in -> transaction.destinationLocation = item.storageLocation;
            case checkout, transfer_out, written_off -> transaction.sourceLocation = item.storageLocation;
            default -> { }
        }
        transaction.availabilityBefore = state.available();
        orm.persist(transaction);
        transaction.availabilityAfter = stock(item).available();
        events.record("stock.changed", "item", item.id, actor.id, input.idempotencyKey(),
                Map.of("itemId", item.id.toString(), "type", transaction.type.name(), "quantity", transaction.quantity));
        return transaction;
    }

    public StockState stock(Item item) {
        return stock(item, orm.transactionTotals(item), orm.unresolvedDamageQuantity(item),
                orm.activeReservationQuantity(item));
    }

    public Map<UUID, StockState> stock(List<Item> items) {
        var itemIds = items.stream().map(item -> item.id).toList();
        var transactionTotals = orm.transactionTotals(itemIds);
        var damageQuantities = orm.unresolvedDamageQuantities(itemIds);
        var reservationQuantities = orm.activeReservationQuantities(itemIds);
        var result = new LinkedHashMap<UUID, StockState>();
        for (var item : items) {
            result.put(item.id, stock(
                    item,
                    transactionTotals.getOrDefault(item.id, Map.of()),
                    Math.toIntExact(damageQuantities.getOrDefault(item.id, 0L)),
                    Math.toIntExact(reservationQuantities.getOrDefault(item.id, 0L))
            ));
        }
        return result;
    }

    private StockState stock(Item item, Map<DomainEnums.TransactionType, Long> totals, int damaged, int reserved) {
        int onHand = quantity(totals, DomainEnums.TransactionType.added)
                + quantity(totals, DomainEnums.TransactionType.received)
                + quantity(totals, DomainEnums.TransactionType.adjusted)
                + quantity(totals, DomainEnums.TransactionType.checkin)
                + quantity(totals, DomainEnums.TransactionType.transfer_in)
                - quantity(totals, DomainEnums.TransactionType.checkout)
                - quantity(totals, DomainEnums.TransactionType.written_off)
                - quantity(totals, DomainEnums.TransactionType.transfer_out);
        if (!totals.containsKey(DomainEnums.TransactionType.added)) onHand += item.baseAmount;
        int checkedOut = quantity(totals, DomainEnums.TransactionType.checkout)
                - quantity(totals, DomainEnums.TransactionType.checkin)
                - quantity(totals, DomainEnums.TransactionType.consumed)
                - quantity(totals, DomainEnums.TransactionType.missing);
        return new StockState(Math.max(0, onHand), Math.max(0, checkedOut), damaged, reserved,
                Math.max(0, onHand - damaged - reserved));
    }

    private int quantity(Map<DomainEnums.TransactionType, Long> totals, DomainEnums.TransactionType type) {
        return Math.toIntExact(totals.getOrDefault(type, 0L));
    }

    public void assertCheckoutAllowed(Item item) {
        refreshMaintenanceStatus(item);
        if (item.maintenanceStatus == DomainEnums.MaintenanceStatus.overdue
                || item.maintenanceStatus == DomainEnums.MaintenanceStatus.in_service) {
            throw ApiException.conflict("Item " + item.name + " is blocked from checkout because maintenance status is "
                    + item.maintenanceStatus);
        }
    }

    @Transactional
    public DamageReport createDamage(ApiModels.DamageInput input) {
        if (input.idempotencyKey() != null) {
            var existing = orm.damageByIdempotencyKey(input.idempotencyKey());
            if (existing != null)
                return existing;
        }
        var report = new DamageReport();
        report.item = lockedItem(input.itemId());
        report.reporter = actors.current();
        report.quantity = input.amount();
        report.description = input.description();
        report.severity = input.severity();
        report.idempotencyKey = input.idempotencyKey();
        if (input.factionOrderId() != null)
            report.factionOrder = required(FactionOrder.class, input.factionOrderId(), "Faction order");
        orm.persist(report);
        events.record("damage.reported", "damage_report", report.id, report.reporter.id, input.idempotencyKey(),
                Map.of("itemId", report.item.id.toString(), "quantity", report.quantity));
        return report;
    }

    @Transactional
    public DamageReport resolveDamage(UUID id, ApiModels.DamageResolutionInput input) {
        if (input.idempotencyKey() != null) {
            var existing = orm.transactionByIdempotencyKey(input.idempotencyKey());
            if (existing != null && existing.damageReport != null && existing.damageReport.id.equals(id))
                return existing.damageReport;
            if (existing != null)
                throw ApiException.conflict("Idempotency key is already used by another stock transaction");
        }
        var report = orm.findLockedDamage(id);
        if (report == null)
            throw ApiException.notFound("Damage report not found");
        var unresolved = report.quantity - report.repairedQuantity - report.writtenOffQuantity;
        if (input.amount() > unresolved)
            throw ApiException.badRequest("Resolution quantity exceeds unresolved damage quantity " + unresolved);
        if (input.status() != DomainEnums.DamageStatus.repaired
                && input.status() != DomainEnums.DamageStatus.written_off
                && input.status() != DomainEnums.DamageStatus.in_review) {
            throw ApiException.badRequest("Unsupported damage resolution status");
        }
        report.handler = actors.current();
        report.resolutionNotes = input.notes();
        if (input.status() == DomainEnums.DamageStatus.in_review) {
            report.status = DomainEnums.DamageStatus.in_review;
            events.record("damage.triaged", "damage_report", report.id, report.handler.id, input.idempotencyKey(),
                    Map.of("itemId", report.item.id.toString(), "quantity", input.amount()));
            return report;
        }
        int availabilityBefore = stock(report.item).available();
        if (input.status() == DomainEnums.DamageStatus.repaired)
            report.repairedQuantity += input.amount();
        else
            report.writtenOffQuantity += input.amount();
        int remaining = report.quantity - report.repairedQuantity - report.writtenOffQuantity;
        report.status = remaining > 0 ? DomainEnums.DamageStatus.in_review
                : report.repairedQuantity == report.quantity ? DomainEnums.DamageStatus.repaired
                        : report.writtenOffQuantity == report.quantity ? DomainEnums.DamageStatus.written_off
                                : DomainEnums.DamageStatus.resolved;

        var transaction = new StockTransaction();
        transaction.item = report.item;
        transaction.user = report.handler;
        transaction.type = input.status() == DomainEnums.DamageStatus.repaired ? DomainEnums.TransactionType.repaired
                : DomainEnums.TransactionType.written_off;
        transaction.quantity = input.amount();
        transaction.damageReport = report;
        transaction.factionOrder = report.factionOrder;
        transaction.reason = input.status() == DomainEnums.DamageStatus.repaired ? "Damage repaired"
                : "Damage written off";
        transaction.notes = input.notes();
        transaction.idempotencyKey = input.idempotencyKey();
        transaction.clientCommandId = input.idempotencyKey();
        if (transaction.type == DomainEnums.TransactionType.written_off)
            transaction.sourceLocation = report.item.storageLocation;
        transaction.availabilityBefore = availabilityBefore;
        orm.persist(transaction);
        transaction.availabilityAfter = stock(report.item).available();
        events.record("damage.resolved", "damage_report", report.id, report.handler.id, input.idempotencyKey(),
                Map.of("itemId", report.item.id.toString(), "type", transaction.type.name(), "quantity", transaction.quantity));
        return report;
    }

    @Transactional
    public MaintenanceRecord recordMaintenance(ApiModels.MaintenanceInput input) {
        var item = lockedItem(input.itemId());
        var record = new MaintenanceRecord();
        record.item = item;
        record.inspector = actors.current();
        record.type = input.type();
        record.performedAt = input.performedAt() == null ? Instant.now() : input.performedAt();
        record.nextDueAt = input.nextDueAt();
        record.operatingHours = input.operatingHours();
        record.result = input.result();
        record.certificateNumber = input.certificateNumber();
        record.notes = input.notes();
        orm.persist(record);
        if (input.operatingHours() != null && input.operatingHours().compareTo(item.currentOperatingHours) > 0)
            item.currentOperatingHours = input.operatingHours();
        item.nextMaintenanceDue = input.nextDueAt() == null ? null
                : input.nextDueAt().atZone(ZoneOffset.UTC).toLocalDate();
        item.maintenanceStatus = input.result() == DomainEnums.MaintenanceResult.failed
                ? DomainEnums.MaintenanceStatus.in_service
                : deriveStatus(item.nextMaintenanceDue);
        events.record("maintenance.recorded", "item", item.id, record.inspector.id, null,
                Map.of("itemId", item.id.toString(), "result", record.result.name(), "type", record.type.name()));
        return record;
    }

    @Transactional
    public List<Map<String, Object>> deficits(UUID eventOccurrenceId) {
        actors.current();
        var active = List.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.submitted,
                DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready);
        List<FactionOrderLine> lines = orm.activeOrderLines(eventOccurrenceId, active);
        var demand = new LinkedHashMap<Item, Integer>();
        for (var line : lines)
            demand.merge(line.item, line.requestedQuantity, Integer::sum);
        var result = new ArrayList<Map<String, Object>>();
        for (var entry : demand.entrySet()) {
            var state = stock(entry.getKey());
            // Active demand already includes prepared lines, so compare it with
            // usable physical stock instead of subtracting reservations twice.
            int usableStock = Math.max(0, state.onHand() - state.damaged());
            int projectedStock = usableStock - entry.getValue();
            int deficit = Math.max(0, -projectedStock);
            if (deficit == 0)
                continue;
            var row = new LinkedHashMap<String, Object>();
            row.put("itemId", entry.getKey().id);
            row.put("sku", entry.getKey().sku);
            row.put("name", entry.getKey().name);
            row.put("category", entry.getKey().category);
            row.put("supplier", entry.getKey().supplier == null || entry.getKey().supplier.isBlank() ? "Unassigned"
                    : entry.getKey().supplier);
            row.put("classification", entry.getKey().consumable ? "consumable" : "asset");
            row.put("demand", entry.getValue());
            row.put("onHandStock", state.onHand());
            row.put("totalOwnedStock", state.totalOwned());
            row.put("availableStock", usableStock);
            row.put("reservedStock", state.reserved());
            row.put("projectedStock", projectedStock);
            row.put("netDeficit", deficit);
            row.put("recommendedAction", entry.getKey().consumable ? "purchase" : "rent_or_purchase");
            result.add(row);
        }
        result.sort((a, b) -> Integer.compare((int) b.get("netDeficit"), (int) a.get("netDeficit")));
        return result;
    }

    public void refreshMaintenanceStatus(Item item) {
        if (item.maintenanceStatus == DomainEnums.MaintenanceStatus.in_service)
            return;
        item.maintenanceStatus = deriveStatus(item.nextMaintenanceDue);
    }

    private DomainEnums.MaintenanceStatus deriveStatus(LocalDate due) {
        if (due == null)
            return DomainEnums.MaintenanceStatus.certified;
        if (due.isBefore(LocalDate.now()))
            return DomainEnums.MaintenanceStatus.overdue;
        if (!due.isAfter(LocalDate.now().plusDays(30)))
            return DomainEnums.MaintenanceStatus.due_soon;
        return DomainEnums.MaintenanceStatus.certified;
    }

    private Item lockedItem(UUID id) {
        var item = orm.findLockedItem(id);
        if (item == null || !item.active)
            throw ApiException.notFound("Item not found");
        return item;
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = orm.find(type, id);
        if (value == null)
            throw ApiException.notFound(label + " not found");
        return value;
    }

    private String requiredText(String value, String field) {
        if (value == null || value.isBlank())
            throw ApiException.badRequest(field + " is required");
        return value.trim();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
