package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.CustodyHandover;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.MaintenanceSchedule;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.OperationsOrm;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Comparator;
import java.util.UUID;

@ApplicationScoped
public class InventoryOperationsService {
    private static final List<DomainEnums.TransactionType> DIRECT_TRANSACTION_TYPES = List.of(
            DomainEnums.TransactionType.checkout,
            DomainEnums.TransactionType.checkin,
            DomainEnums.TransactionType.added,
            DomainEnums.TransactionType.adjusted);
    private final OperationsOrm orm;
    private final ActorService actors;
    private final DomainEventService events;

    public InventoryOperationsService(OperationsOrm orm, ActorService actors, DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
    }

    public record StockState(int onHand, int checkedOut, int damaged, int reserved, int available) {
        public int totalOwned() {
            return onHand + checkedOut;
        }
    }

    public record Deficit(
            UUID itemId, String sku, String name, String category, String supplier, String classification,
            int demand, int onHandStock, int totalOwnedStock, int availableStock, int reservedStock,
            int projectedStock, int netDeficit, String recommendedAction) {}

    @Transactional
    public StockTransaction transact(ApiModels.TransactionInput input) {
        var actor = actors.current();
        if (!DIRECT_TRANSACTION_TYPES.contains(input.transactionType())) {
            throw ApiException.badRequest("Transaction type " + input.transactionType()
                    + " must be created by its owning inventory workflow");
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
            return transactSerialized(input, item, actor);
        }
        if (input.assetInstanceId() != null)
            throw ApiException.badRequest("assetInstanceId can only be used with serialized items");
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

    private StockTransaction transactSerialized(ApiModels.TransactionInput input, Item item, UserAccount actor) {
        if (input.transactionType() != DomainEnums.TransactionType.checkout
                && input.transactionType() != DomainEnums.TransactionType.checkin) {
            throw ApiException.conflict("Serialized stock changes must be made through individual asset records");
        }
        if (input.quantityChanged() != 1)
            throw ApiException.badRequest("A serialized asset transaction must have quantity 1");
        if (input.assetInstanceId() == null)
            throw ApiException.conflict("Select the serialized asset to " + input.transactionType().name());

        AssetInstance asset = orm.findLockedAsset(input.assetInstanceId());
        if (asset == null || !asset.active || !asset.item.id.equals(item.id))
            throw ApiException.notFound("Asset instance not found for this item");

        var before = stock(item).available();
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.assetInstance = asset;
        transaction.user = input.userId() == null ? actor : required(UserAccount.class, input.userId(), "User");
        transaction.type = input.transactionType();
        transaction.quantity = 1;
        transaction.reason = input.reason();
        transaction.notes = input.notes();
        transaction.eventType = blankToNull(input.eventType());
        transaction.faction = blankToNull(input.faction());
        transaction.idempotencyKey = input.idempotencyKey();
        transaction.clientCommandId = input.idempotencyKey();
        transaction.availabilityBefore = before;

        if (input.transactionType() == DomainEnums.TransactionType.checkout) {
            requiredText(input.eventType(), "eventType");
            requiredText(input.faction(), "faction");
            assertCheckoutAllowed(item);
            assertAssetCheckoutAllowed(asset);
            if (asset.availabilityStatus != DomainEnums.AssetState.available)
                throw ApiException.conflict("Asset " + asset.assetCode + " is not available");
            transaction.sourceLocation = asset.currentLocation == null ? item.storageLocation : asset.currentLocation;
            asset.availabilityStatus = DomainEnums.AssetState.in_field;
            asset.currentLocation = null;
            asset.currentCustodian = null;
        } else {
            if (asset.availabilityStatus != DomainEnums.AssetState.in_field
                    && asset.availabilityStatus != DomainEnums.AssetState.in_custody
                    && asset.availabilityStatus != DomainEnums.AssetState.returned_pending_check) {
                throw ApiException.conflict("Asset " + asset.assetCode + " is not checked out");
            }
            transaction.sourceLocation = asset.currentLocation;
            transaction.destinationLocation = item.storageLocation;
            asset.availabilityStatus = DomainEnums.AssetState.available;
            asset.currentLocation = item.storageLocation;
            asset.currentCustodian = null;
        }

        orm.persist(transaction);
        transaction.availabilityAfter = stock(item).available();
        var payload = new LinkedHashMap<String, Object>();
        payload.put("itemId", item.id.toString());
        payload.put("assetInstanceId", asset.id.toString());
        payload.put("assetCode", asset.assetCode);
        payload.put("type", transaction.type.name());
        payload.put("quantity", 1);
        events.record("stock.changed", "item", item.id, actor.id, input.idempotencyKey(), payload);
        return transaction;
    }

    private void assertAssetCheckoutAllowed(AssetInstance asset) {
        if (asset.conditionStatus == DomainEnums.ConditionStatus.damaged
                || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe
                || asset.conditionStatus == DomainEnums.ConditionStatus.lost) {
            throw ApiException.conflict("Asset " + asset.assetCode + " is blocked because its condition is "
                    + asset.conditionStatus);
        }
        if (asset.serviceStatus == DomainEnums.MaintenanceStatus.overdue
                || asset.serviceStatus == DomainEnums.MaintenanceStatus.in_service) {
            throw ApiException.conflict("Asset " + asset.assetCode + " is blocked because its service status is "
                    + asset.serviceStatus);
        }
        assertNoBlockingScheduleIsDue(asset.item, asset);
    }

    public StockState stock(Item item) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            var assets = orm.assetsForItem(item);
            if (!assets.isEmpty()) {
                return calculateAssetStock(assets);
            }
        }
        return stock(item, orm.transactionTotals(item), orm.unresolvedDamageQuantity(item),
                orm.activeReservationQuantity(item));
    }

    public Map<UUID, StockState> stock(List<Item> items) {
        var itemIds = items.stream().map(item -> item.id).toList();
        var transactionTotals = orm.transactionTotals(itemIds);
        var damageQuantities = orm.unresolvedDamageQuantities(itemIds);
        var reservationQuantities = orm.activeReservationQuantities(itemIds);
        var serializedAssets = orm.assetsForItems(items.stream()
                .filter(i -> i.trackingMode == DomainEnums.TrackingMode.serialized)
                .map(i -> i.id).toList());
        var assetsByItem = new LinkedHashMap<UUID, List<org.ash.inventory.model.AssetInstance>>();
        for (var asset : serializedAssets) {
            assetsByItem.computeIfAbsent(asset.item.id, ignored -> new ArrayList<>()).add(asset);
        }

        var result = new LinkedHashMap<UUID, StockState>();
        for (var item : items) {
            if (item.trackingMode == DomainEnums.TrackingMode.serialized && assetsByItem.containsKey(item.id)) {
                result.put(item.id, calculateAssetStock(assetsByItem.get(item.id)));
            } else {
                result.put(item.id, stock(
                        item,
                        transactionTotals.getOrDefault(item.id, Map.of()),
                        Math.toIntExact(damageQuantities.getOrDefault(item.id, 0L)),
                        Math.toIntExact(reservationQuantities.getOrDefault(item.id, 0L))
                ));
            }
        }
        return result;
    }

    private StockState calculateAssetStock(List<org.ash.inventory.model.AssetInstance> assets) {
        int onHand = 0;
        int checkedOut = 0;
        int damaged = 0;
        int reserved = 0;
        int available = 0;
        for (var asset : assets) {
            boolean isDamaged = asset.availabilityStatus == DomainEnums.AssetState.damaged
                    || asset.availabilityStatus == DomainEnums.AssetState.in_repair
                    || asset.conditionStatus == DomainEnums.ConditionStatus.damaged
                    || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe;
            boolean isCheckedOut = asset.availabilityStatus == DomainEnums.AssetState.in_custody
                    || asset.availabilityStatus == DomainEnums.AssetState.in_field
                    || asset.availabilityStatus == DomainEnums.AssetState.returned_pending_check;
            boolean isReserved = asset.availabilityStatus == DomainEnums.AssetState.reserved
                    || asset.availabilityStatus == DomainEnums.AssetState.staged;
            boolean isLostOrWrittenOff = asset.availabilityStatus == DomainEnums.AssetState.lost
                    || asset.availabilityStatus == DomainEnums.AssetState.written_off
                    || asset.conditionStatus == DomainEnums.ConditionStatus.lost;

            if (isLostOrWrittenOff) continue;

            if (isCheckedOut) {
                checkedOut++;
            } else {
                onHand++;
                if (isDamaged) {
                    damaged++;
                } else if (isReserved) {
                    reserved++;
                } else if (asset.availabilityStatus == DomainEnums.AssetState.available) {
                    available++;
                }
            }
        }
        return new StockState(onHand, checkedOut, damaged, reserved, available);
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
        assertNoBlockingScheduleIsDue(item, null);
    }

    @Transactional
    public DamageReport createDamage(ApiModels.DamageInput input) {
        if (input.idempotencyKey() != null) {
            var existing = orm.damageByIdempotencyKey(input.idempotencyKey());
            if (existing != null)
                return existing;
        }
        if ((input.itemId() == null) == (input.assemblyId() == null)) {
            throw ApiException.badRequest("Exactly one of itemId or assemblyId is required");
        }
        var report = new DamageReport();
        if (input.itemId() != null) report.item = lockedItem(input.itemId());
        else report.assembly = required(Assembly.class, input.assemblyId(), "Assembly");
        report.reporter = actors.current();
        report.quantity = input.amount();
        report.description = input.description();
        report.severity = input.severity();
        report.safetyImpact = input.safetyImpact();
        report.idempotencyKey = input.idempotencyKey();
        if (input.factionOrderId() != null)
            report.factionOrder = required(FactionOrder.class, input.factionOrderId(), "Faction order");
        if (input.assetInstanceId() != null) {
            if (report.item == null) throw ApiException.badRequest("An asset can only be reported with its item");
            var asset = orm.findLockedAsset(input.assetInstanceId());
            if (asset == null || !asset.active || !asset.item.id.equals(report.item.id)) {
                throw ApiException.badRequest("Asset does not belong to the damaged item");
            }
            if (input.amount() != 1) throw ApiException.badRequest("Serialized asset damage quantity must be 1");
            report.assetInstance = asset;
            asset.conditionStatus = input.safetyImpact()
                    ? DomainEnums.ConditionStatus.unsafe : DomainEnums.ConditionStatus.damaged;
            asset.availabilityStatus = DomainEnums.AssetState.damaged;
        } else if (report.item != null && report.item.trackingMode == DomainEnums.TrackingMode.serialized) {
            throw ApiException.badRequest("assetInstanceId is required for serialized item damage");
        }
        if (input.handoverId() != null) {
            report.handover = required(CustodyHandover.class, input.handoverId(), "Custody handover");
        }
        orm.persist(report);
        var payload = new LinkedHashMap<String, Object>();
        if (report.item != null) payload.put("itemId", report.item.id.toString());
        if (report.assembly != null) payload.put("assemblyId", report.assembly.id.toString());
        payload.put("quantity", report.quantity);
        events.record("damage.reported", "damage_report", report.id, report.reporter.id, input.idempotencyKey(),
                payload);
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
        if (input.description() != null) {
            if (input.description().isBlank()) throw ApiException.badRequest("Damage description must not be blank");
            report.description = input.description().trim();
        }
        if (input.severity() != null) report.severity = input.severity();
        if (input.status() == null) {
            events.record("damage.updated", "damage_report", report.id, actors.current().id, input.idempotencyKey(),
                    Map.of("severity", report.severity.name()));
            return report;
        }
        int resolutionAmount = input.amount() == null ? 1 : input.amount();
        var unresolved = report.quantity - report.repairedQuantity - report.writtenOffQuantity;
        if (resolutionAmount > unresolved)
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
            var payload = new LinkedHashMap<String, Object>();
            if (report.item != null) payload.put("itemId", report.item.id.toString());
            if (report.assembly != null) payload.put("assemblyId", report.assembly.id.toString());
            payload.put("quantity", resolutionAmount);
            events.record("damage.triaged", "damage_report", report.id, report.handler.id, input.idempotencyKey(),
                    payload);
            return report;
        }
        if (input.status() == DomainEnums.DamageStatus.repaired)
            report.repairedQuantity += resolutionAmount;
        else
            report.writtenOffQuantity += resolutionAmount;
        int remaining = report.quantity - report.repairedQuantity - report.writtenOffQuantity;
        report.status = remaining > 0 ? DomainEnums.DamageStatus.in_review
                : report.repairedQuantity == report.quantity ? DomainEnums.DamageStatus.repaired
                        : report.writtenOffQuantity == report.quantity ? DomainEnums.DamageStatus.written_off
                                : DomainEnums.DamageStatus.resolved;

        if (report.item == null) {
            events.record("damage.resolved", "damage_report", report.id, report.handler.id, input.idempotencyKey(),
                    Map.of("assemblyId", report.assembly.id.toString(), "type", input.status().name(), "quantity", resolutionAmount));
            return report;
        }

        int availabilityBefore = stock(report.item).available();
        var transaction = new StockTransaction();
        transaction.item = report.item;
        transaction.assetInstance = report.assetInstance;
        transaction.user = report.handler;
        transaction.type = input.status() == DomainEnums.DamageStatus.repaired ? DomainEnums.TransactionType.repaired
                : DomainEnums.TransactionType.written_off;
        transaction.quantity = resolutionAmount;
        transaction.damageReport = report;
        transaction.factionOrder = report.factionOrder;
        transaction.reason = input.status() == DomainEnums.DamageStatus.repaired ? "Damage repaired"
                : "Damage written off";
        transaction.notes = input.notes();
        transaction.idempotencyKey = input.idempotencyKey();
        transaction.clientCommandId = input.idempotencyKey();
        if (transaction.type == DomainEnums.TransactionType.written_off)
            transaction.sourceLocation = report.assetInstance == null
                    ? report.item.storageLocation : report.assetInstance.currentLocation;
        transaction.availabilityBefore = availabilityBefore;
        orm.persist(transaction);
        if (report.assetInstance != null) {
            if (transaction.type == DomainEnums.TransactionType.written_off) {
                report.assetInstance.availabilityStatus = DomainEnums.AssetState.written_off;
                report.assetInstance.active = false;
            } else {
                report.assetInstance.conditionStatus = DomainEnums.ConditionStatus.good;
                report.assetInstance.availabilityStatus = DomainEnums.AssetState.available;
            }
        }
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
        if (input.assetInstanceId() != null) {
            var asset = orm.findLockedAsset(input.assetInstanceId());
            if (asset == null || !asset.active || !asset.item.id.equals(item.id)) {
                throw ApiException.badRequest("Asset does not belong to the maintenance item");
            }
            record.assetInstance = asset;
        } else if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            throw ApiException.badRequest("assetInstanceId is required for serialized item maintenance");
        }
        if (input.scheduleId() != null) {
            var schedule = required(MaintenanceSchedule.class, input.scheduleId(), "Maintenance schedule");
            if (!schedule.item.id.equals(item.id)
                    || (schedule.assetInstance != null && (record.assetInstance == null
                            || !record.assetInstance.id.equals(schedule.assetInstance.id)))) {
                throw ApiException.badRequest("Maintenance schedule does not apply to this item or asset");
            }
            record.schedule = schedule;
        }
        record.inspector = actors.current();
        record.type = input.type();
        record.performedAt = input.performedAt() == null ? Instant.now() : input.performedAt();
        record.nextDueAt = input.nextDueAt() != null ? input.nextDueAt()
                : item.maintenanceIntervalDays != null && item.maintenanceIntervalDays > 0
                    ? record.performedAt.plus(java.time.Duration.ofDays(item.maintenanceIntervalDays)) : null;
        record.operatingHours = input.operatingHours();
        record.result = input.result();
        record.certificateNumber = input.certificateNumber();
        record.certificateObjectKey = input.certificateObjectKey();
        record.notes = input.notes();
        advanceSchedule(record);
        orm.persist(record);
        if (input.operatingHours() != null && input.operatingHours().compareTo(item.currentOperatingHours) > 0)
            item.currentOperatingHours = input.operatingHours();
        item.nextMaintenanceDue = record.nextDueAt == null ? null
                : record.nextDueAt.atZone(ZoneOffset.UTC).toLocalDate();
        item.maintenanceStatus = input.result() == DomainEnums.MaintenanceResult.failed
                ? DomainEnums.MaintenanceStatus.in_service
                : deriveStatus(item.nextMaintenanceDue);
        if (record.assetInstance != null) {
            record.assetInstance.operatingHours = input.operatingHours() == null
                    ? record.assetInstance.operatingHours : input.operatingHours();
            record.assetInstance.serviceStatus = input.result() == DomainEnums.MaintenanceResult.failed
                    ? DomainEnums.MaintenanceStatus.in_service : DomainEnums.MaintenanceStatus.certified;
            if (input.result() == DomainEnums.MaintenanceResult.failed) {
                record.assetInstance.availabilityStatus = DomainEnums.AssetState.in_maintenance;
            } else if (record.assetInstance.availabilityStatus == DomainEnums.AssetState.in_maintenance) {
                record.assetInstance.availabilityStatus = DomainEnums.AssetState.available;
            }
        }
        events.record("maintenance.recorded", "item", item.id, record.inspector.id, null,
                Map.of("itemId", item.id.toString(), "result", record.result.name(), "type", record.type.name()));
        return record;
    }

    private void advanceSchedule(MaintenanceRecord record) {
        var schedule = record.schedule;
        if (schedule == null || record.result == DomainEnums.MaintenanceResult.failed) return;
        switch (schedule.intervalType) {
            case date -> {
                if (record.nextDueAt == null) {
                    long days;
                    try {
                        days = schedule.intervalValue.longValueExact();
                    } catch (ArithmeticException exception) {
                        throw ApiException.badRequest("Date maintenance intervals must be whole days");
                    }
                    record.nextDueAt = record.performedAt.plus(days, java.time.temporal.ChronoUnit.DAYS);
                }
                schedule.nextDueAt = record.nextDueAt;
            }
            case operating_hours -> {
                if (record.operatingHours == null) {
                    throw ApiException.badRequest("operatingHours is required for this maintenance schedule");
                }
                schedule.nextDueValue = record.operatingHours.add(schedule.intervalValue);
            }
            case usage_count -> schedule.nextDueValue = BigDecimal.valueOf(
                    orm.checkoutCount(record.item, record.assetInstance)).add(schedule.intervalValue);
        }
    }

    private void assertNoBlockingScheduleIsDue(Item item, AssetInstance asset) {
        var now = Instant.now();
        for (var schedule : orm.blockingSchedules(item, asset)) {
            boolean due = switch (schedule.intervalType) {
                case date -> schedule.nextDueAt != null && !schedule.nextDueAt.isAfter(now);
                case operating_hours -> schedule.nextDueValue != null
                        && (asset == null ? item.currentOperatingHours : asset.operatingHours)
                                .compareTo(schedule.nextDueValue) >= 0;
                case usage_count -> schedule.nextDueValue != null
                        && BigDecimal.valueOf(orm.checkoutCount(item, asset)).compareTo(schedule.nextDueValue) >= 0;
            };
            if (due) {
                throw ApiException.conflict("Checkout is blocked by overdue " + schedule.maintenanceType
                        + " maintenance");
            }
        }
    }

    @Transactional
    public List<Deficit> deficits(UUID eventOccurrenceId) {
        actors.current();
        var active = List.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.submitted,
                DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready);
        List<FactionOrderLine> lines = orm.activeOrderLines(eventOccurrenceId, active);
        var demand = new LinkedHashMap<Item, Integer>();
        for (var line : lines)
            demand.merge(line.item, line.requestedQuantity, Integer::sum);
        var stockByItem = stock(List.copyOf(demand.keySet()));
        var result = new ArrayList<Deficit>();
        for (var entry : demand.entrySet()) {
            var state = stockByItem.get(entry.getKey().id);
            // Active demand already includes prepared lines, so compare it with
            // usable physical stock instead of subtracting reservations twice.
            int usableStock = Math.max(0, state.onHand() - state.damaged());
            int projectedStock = usableStock - entry.getValue();
            int deficit = Math.max(0, -projectedStock);
            if (deficit == 0)
                continue;
            result.add(new Deficit(
                    entry.getKey().id,
                    entry.getKey().sku,
                    entry.getKey().name,
                    entry.getKey().category,
                    entry.getKey().supplier == null || entry.getKey().supplier.isBlank() ? "Unassigned"
                            : entry.getKey().supplier,
                    entry.getKey().consumable ? "consumable" : "asset",
                    entry.getValue(),
                    state.onHand(),
                    state.totalOwned(),
                    usableStock,
                    state.reserved(),
                    projectedStock,
                    deficit,
                    entry.getKey().consumable ? "purchase" : "rent_or_purchase"));
        }
        result.sort(Comparator.comparingInt(Deficit::netDeficit).reversed());
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
