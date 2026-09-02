package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.OperationsOrm;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class InventoryOperationsService {
    @Inject OperationsOrm orm;
    @Inject ActorService actors;

    public record StockState(int physical, int checkedOut, int damaged, int reserved, int available) {}

    @Transactional
    public StockTransaction transact(ApiModels.TransactionInput input) {
        var actor = actors.current();
        if (input.transactionType() == DomainEnums.TransactionType.repaired || input.transactionType() == DomainEnums.TransactionType.written_off) {
            throw ApiException.badRequest("Damage resolution transactions must be created from a damage report");
        }
        if (input.idempotencyKey() != null) {
            var existing = orm.transactionByIdempotencyKey(input.idempotencyKey());
            if (existing != null) return existing;
        }
        var item = lockedItem(input.itemId());
        var state = stock(item);
        if (input.transactionType() == DomainEnums.TransactionType.checkout) {
            assertCheckoutAllowed(item);
            if (input.quantityChanged() > state.available()) throw ApiException.conflict("Only " + state.available() + " units are available");
        }
        if (input.transactionType() == DomainEnums.TransactionType.checkin && input.quantityChanged() > state.checkedOut()) {
            throw ApiException.conflict("Only " + state.checkedOut() + " units are checked out");
        }
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.user = input.userId() == null ? actor : required(UserAccount.class, input.userId(), "User");
        transaction.type = input.transactionType();
        transaction.quantity = input.quantityChanged();
        transaction.reason = input.reason();
        transaction.notes = input.notes();
        transaction.idempotencyKey = input.idempotencyKey();
        if (input.factionOrderId() != null) transaction.factionOrder = required(FactionOrder.class, input.factionOrderId(), "Faction order");
        orm.persist(transaction);
        return transaction;
    }

    public StockState stock(Item item) {
        int physical = 0;
        boolean hasAddedTransaction = false;
        int checkedOut = 0;
        for (var tx : orm.transactions(item)) {
            switch (tx.type) {
                case added -> {
                    hasAddedTransaction = true;
                    physical += tx.quantity;
                }
                case repaired, checkin -> physical += tx.quantity;
                case checkout -> { physical -= tx.quantity; checkedOut += tx.quantity; }
                case written_off, consumed -> physical -= tx.quantity;
            }
            if (tx.type == DomainEnums.TransactionType.checkin) checkedOut = Math.max(0, checkedOut - tx.quantity);
        }
        if (!hasAddedTransaction) {
            physical += item.baseAmount;
        }
        int damaged = orm.unresolvedDamage(item).stream()
                .mapToInt(report -> Math.max(0, report.quantity - report.repairedQuantity - report.writtenOffQuantity)).sum();
        int reserved = orm.reservedLines(item).stream()
                .mapToInt(line -> line.preparedQuantity).sum();
        return new StockState(Math.max(0, physical), Math.max(0, checkedOut), damaged, reserved,
                Math.max(0, physical - damaged - reserved));
    }

    public void assertCheckoutAllowed(Item item) {
        refreshMaintenanceStatus(item);
        if (item.maintenanceStatus == DomainEnums.MaintenanceStatus.overdue || item.maintenanceStatus == DomainEnums.MaintenanceStatus.in_service) {
            throw ApiException.conflict("Item " + item.name + " is blocked from checkout because maintenance status is " + item.maintenanceStatus);
        }
    }

    @Transactional
    public DamageReport createDamage(ApiModels.DamageInput input) {
        if (input.idempotencyKey() != null) {
            var existing = orm.damageByIdempotencyKey(input.idempotencyKey());
            if (existing != null) return existing;
        }
        var report = new DamageReport();
        report.item = lockedItem(input.itemId());
        report.reporter = actors.current();
        report.quantity = input.amount();
        report.description = input.description();
        report.severity = input.severity();
        report.idempotencyKey = input.idempotencyKey();
        if (input.factionOrderId() != null) report.factionOrder = required(FactionOrder.class, input.factionOrderId(), "Faction order");
        orm.persist(report);
        return report;
    }

    @Transactional
    public DamageReport resolveDamage(UUID id, ApiModels.DamageResolutionInput input) {
        var report = orm.findLockedDamage(id);
        if (report == null) throw ApiException.notFound("Damage report not found");
        var unresolved = report.quantity - report.repairedQuantity - report.writtenOffQuantity;
        if (input.amount() > unresolved) throw ApiException.badRequest("Resolution quantity exceeds unresolved damage quantity " + unresolved);
        if (input.status() != DomainEnums.DamageStatus.repaired && input.status() != DomainEnums.DamageStatus.written_off
                && input.status() != DomainEnums.DamageStatus.in_review) {
            throw ApiException.badRequest("Unsupported damage resolution status");
        }
        report.handler = actors.current();
        report.resolutionNotes = input.notes();
        if (input.status() == DomainEnums.DamageStatus.in_review) {
            report.status = DomainEnums.DamageStatus.in_review;
            return report;
        }
        if (input.status() == DomainEnums.DamageStatus.repaired) report.repairedQuantity += input.amount();
        else report.writtenOffQuantity += input.amount();
        int remaining = report.quantity - report.repairedQuantity - report.writtenOffQuantity;
        report.status = remaining > 0 ? DomainEnums.DamageStatus.in_review
                : report.repairedQuantity == report.quantity ? DomainEnums.DamageStatus.repaired
                : report.writtenOffQuantity == report.quantity ? DomainEnums.DamageStatus.written_off
                : DomainEnums.DamageStatus.resolved;

        var transaction = new StockTransaction();
        transaction.item = report.item;
        transaction.user = report.handler;
        transaction.type = input.status() == DomainEnums.DamageStatus.repaired ? DomainEnums.TransactionType.repaired : DomainEnums.TransactionType.written_off;
        transaction.quantity = input.amount();
        transaction.damageReport = report;
        transaction.factionOrder = report.factionOrder;
        transaction.reason = input.status() == DomainEnums.DamageStatus.repaired ? "Damage repaired" : "Damage written off";
        transaction.notes = input.notes();
        transaction.idempotencyKey = input.idempotencyKey();
        orm.persist(transaction);
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
        if (input.operatingHours() != null && input.operatingHours().compareTo(item.currentOperatingHours) > 0) item.currentOperatingHours = input.operatingHours();
        item.nextMaintenanceDue = input.nextDueAt() == null ? null : input.nextDueAt().atZone(ZoneOffset.UTC).toLocalDate();
        item.maintenanceStatus = input.result() == DomainEnums.MaintenanceResult.failed
                ? DomainEnums.MaintenanceStatus.in_service : deriveStatus(item.nextMaintenanceDue);
        return record;
    }

    @Transactional
    public List<Map<String, Object>> deficits(UUID eventOccurrenceId) {
        actors.current();
        var active = List.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.submitted,
                DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready);
        List<FactionOrderLine> lines = orm.activeOrderLines(eventOccurrenceId, active);
        var demand = new LinkedHashMap<Item, Integer>();
        for (var line : lines) demand.merge(line.item, line.requestedQuantity, Integer::sum);
        var result = new ArrayList<Map<String, Object>>();
        for (var entry : demand.entrySet()) {
            var state = stock(entry.getKey());
            int deficit = Math.max(0, entry.getValue() - state.available());
            if (deficit == 0) continue;
            var row = new LinkedHashMap<String, Object>();
            row.put("itemId", entry.getKey().id);
            row.put("sku", entry.getKey().sku);
            row.put("name", entry.getKey().name);
            row.put("category", entry.getKey().category);
            row.put("supplier", entry.getKey().supplier == null || entry.getKey().supplier.isBlank() ? "Unassigned" : entry.getKey().supplier);
            row.put("classification", entry.getKey().consumable ? "consumable" : "asset");
            row.put("demand", entry.getValue());
            row.put("physicalStock", state.physical());
            row.put("availableStock", state.available());
            row.put("reservedStock", state.reserved());
            row.put("netDeficit", deficit);
            row.put("recommendedAction", entry.getKey().consumable ? "purchase" : "rent_or_purchase");
            result.add(row);
        }
        result.sort((a, b) -> Integer.compare((int) b.get("netDeficit"), (int) a.get("netDeficit")));
        return result;
    }

    public void refreshMaintenanceStatus(Item item) {
        if (item.maintenanceStatus == DomainEnums.MaintenanceStatus.in_service) return;
        item.maintenanceStatus = deriveStatus(item.nextMaintenanceDue);
    }

    private DomainEnums.MaintenanceStatus deriveStatus(LocalDate due) {
        if (due == null) return DomainEnums.MaintenanceStatus.certified;
        if (due.isBefore(LocalDate.now())) return DomainEnums.MaintenanceStatus.overdue;
        if (!due.isAfter(LocalDate.now().plusDays(30))) return DomainEnums.MaintenanceStatus.due_soon;
        return DomainEnums.MaintenanceStatus.certified;
    }

    private Item lockedItem(UUID id) {
        var item = orm.findLockedItem(id);
        if (item == null || !item.active) throw ApiException.notFound("Item not found");
        return item;
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = orm.find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }
}
