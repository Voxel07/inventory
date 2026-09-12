package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.LifecycleOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.resource.dto.LifecycleDtos;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class LifecycleService {
    private static final Map<DomainEnums.RepairStatus, Set<DomainEnums.RepairStatus>> TRANSITIONS = Map.of(
            DomainEnums.RepairStatus.reported, Set.of(DomainEnums.RepairStatus.triaged, DomainEnums.RepairStatus.written_off),
            DomainEnums.RepairStatus.triaged, Set.of(DomainEnums.RepairStatus.awaiting_repair, DomainEnums.RepairStatus.written_off),
            DomainEnums.RepairStatus.awaiting_repair, Set.of(DomainEnums.RepairStatus.in_repair, DomainEnums.RepairStatus.written_off),
            DomainEnums.RepairStatus.in_repair, Set.of(DomainEnums.RepairStatus.repaired, DomainEnums.RepairStatus.written_off),
            DomainEnums.RepairStatus.repaired, Set.of(DomainEnums.RepairStatus.verified),
            DomainEnums.RepairStatus.verified, Set.of(DomainEnums.RepairStatus.returned_to_service));

    private final LifecycleOrm orm;
    private final ActorService actors;
    private final DomainEventService events;
    private final InventoryOperationsService inventory;

    public LifecycleService(LifecycleOrm orm, ActorService actors, DomainEventService events,
            InventoryOperationsService inventory) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
        this.inventory = inventory;
    }

    public List<MaintenanceSchedule> schedules(UUID itemId, UUID assetId, int page, int size) {
        actors.current();
        return orm.schedules(itemId, assetId, offset(page, size), size);
    }

    @Transactional
    public MaintenanceSchedule createSchedule(LifecycleDtos.ScheduleInput input) {
        actors.requireMaintenance();
        var schedule = new MaintenanceSchedule();
        apply(schedule, input);
        orm.persist(schedule);
        events.record("maintenance_schedule.created", "maintenance_schedule", schedule.id, actors.current().id, null,
                Map.of("itemId", schedule.item.id.toString()));
        return schedule;
    }

    @Transactional
    public MaintenanceSchedule updateSchedule(UUID id, LifecycleDtos.ScheduleInput input) {
        actors.requireMaintenance();
        var schedule = requiredLocked(MaintenanceSchedule.class, id, "Maintenance schedule");
        apply(schedule, input);
        return schedule;
    }

    @Transactional
    public void retireSchedule(UUID id) {
        actors.requireMaintenance();
        requiredLocked(MaintenanceSchedule.class, id, "Maintenance schedule").active = false;
    }

    private void apply(MaintenanceSchedule schedule, LifecycleDtos.ScheduleInput input) {
        schedule.item = required(Item.class, input.itemId(), "Item");
        schedule.assetInstance = input.assetInstanceId() == null ? null : required(AssetInstance.class, input.assetInstanceId(), "Asset");
        if (schedule.assetInstance != null && !schedule.assetInstance.item.id.equals(schedule.item.id)) {
            throw ApiException.badRequest("Maintenance asset does not belong to item");
        }
        schedule.maintenanceType = input.maintenanceType();
        schedule.intervalType = input.intervalType();
        schedule.intervalValue = input.intervalValue();
        schedule.nextDueAt = input.nextDueAt();
        schedule.nextDueValue = input.nextDueValue();
        if (schedule.intervalType == DomainEnums.MaintenanceIntervalType.date && schedule.nextDueAt == null) {
            throw ApiException.badRequest("nextDueAt is required for date-based schedules");
        }
        if (schedule.intervalType != DomainEnums.MaintenanceIntervalType.date && schedule.nextDueValue == null) {
            throw ApiException.badRequest("nextDueValue is required for meter-based schedules");
        }
        schedule.warningWindow = input.warningWindow() == null ? BigDecimal.ZERO : input.warningWindow();
        schedule.responsiblePerson = input.responsiblePersonId() == null ? null : required(UserAccount.class, input.responsiblePersonId(), "User");
        schedule.requiredChecklist = input.requiredChecklist();
        schedule.checkoutBlocking = input.checkoutBlocking();
        if (input.active() != null) schedule.active = input.active();
    }

    public List<RepairCase> repairs(String status, int page, int size) {
        actors.current();
        try { return orm.repairs(status, offset(page, size), size); }
        catch (IllegalArgumentException exception) { throw ApiException.badRequest("Unknown repair status"); }
    }

    @Transactional
    public RepairCase createRepair(LifecycleDtos.RepairInput input) {
        actors.requireMaintenance();
        var damage = required(DamageReport.class, input.damageReportId(), "Damage report");
        var existing = orm.repairForDamage(damage.id);
        if (existing != null) return existing;
        var repair = new RepairCase();
        repair.damageReport = damage;
        repair.assetInstance = damage.assetInstance;
        repair.handover = damage.handover;
        repair.safetyImpact = damage.safetyImpact;
        repair.repairOwner = input.repairOwnerId() == null ? actors.current() : required(UserAccount.class, input.repairOwnerId(), "User");
        repair.repairVendor = input.vendorId() == null ? null : required(Vendor.class, input.vendorId(), "Vendor");
        repair.partsAndCostNotes = input.partsAndCostNotes();
        repair.notes = input.notes();
        orm.persist(repair);
        events.record("repair.created", "repair_case", repair.id, actors.current().id, null,
                Map.of("damageReportId", damage.id.toString()));
        return repair;
    }

    @Transactional
    public RepairCase transitionRepair(UUID id, LifecycleDtos.RepairTransitionInput input) {
        actors.requireMaintenance();
        var repair = requiredLocked(RepairCase.class, id, "Repair case");
        if (!TRANSITIONS.getOrDefault(repair.status, Set.of()).contains(input.status())) {
            throw ApiException.conflict("Invalid repair transition: " + repair.status + " -> " + input.status());
        }
        if (input.status() == DomainEnums.RepairStatus.written_off) actors.requireAdmin();
        if (input.repairOwnerId() != null) repair.repairOwner = required(UserAccount.class, input.repairOwnerId(), "User");
        if (input.vendorId() != null) repair.repairVendor = required(Vendor.class, input.vendorId(), "Vendor");
        if (input.status() == DomainEnums.RepairStatus.in_repair && repair.startedAt == null) repair.startedAt = Instant.now();
        if (input.status() == DomainEnums.RepairStatus.repaired || input.status() == DomainEnums.RepairStatus.written_off) {
            int amount = input.amount() == null && repair.assetInstance != null ? 1
                    : input.amount() == null ? 0 : input.amount();
            if (amount < 1) throw ApiException.badRequest("amount is required for a bulk repair resolution");
            inventory.resolveDamage(repair.damageReport.id, new ApiModels.DamageResolutionInput(
                    input.status() == DomainEnums.RepairStatus.repaired ? DomainEnums.DamageStatus.repaired
                            : DomainEnums.DamageStatus.written_off,
                    amount, input.notes(), input.idempotencyKey(), null, null));
            if (input.status() == DomainEnums.RepairStatus.repaired && repair.assetInstance != null) {
                // Completion of the workshop step is not approval to return the asset to stock.
                repair.assetInstance.availabilityStatus = DomainEnums.AssetState.in_repair;
                repair.assetInstance.conditionStatus = DomainEnums.ConditionStatus.fair;
            }
            repair.completedAt = Instant.now();
        }
        if (input.status() == DomainEnums.RepairStatus.verified) {
            if (input.verificationResult() == null || input.verificationResult().isBlank()) {
                throw ApiException.badRequest("verificationResult is required");
            }
            repair.verificationResult = input.verificationResult();
            repair.approvedBy = actors.current();
        }
        if (input.status() == DomainEnums.RepairStatus.returned_to_service && repair.assetInstance != null) {
            repair.assetInstance.active = true;
            repair.assetInstance.conditionStatus = DomainEnums.ConditionStatus.good;
            repair.assetInstance.availabilityStatus = DomainEnums.AssetState.available;
        }
        repair.status = input.status();
        repair.notes = input.notes() == null ? repair.notes : input.notes();
        events.record("repair." + input.status().name(), "repair_case", repair.id, actors.current().id,
                input.idempotencyKey(), Map.of("damageReportId", repair.damageReport.id.toString()));
        return repair;
    }

    private int offset(int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        try {
            return Math.multiplyExact(page, size);
        } catch (ArithmeticException exception) {
            throw ApiException.badRequest("Page offset is too large");
        }
    }
    private <T> T required(Class<T> type, UUID id, String label) {
        var value = orm.find(type, id); if (value == null) throw ApiException.notFound(label + " not found"); return value;
    }
    private <T> T requiredLocked(Class<T> type, UUID id, String label) {
        var value = orm.locked(type, id); if (value == null) throw ApiException.notFound(label + " not found"); return value;
    }
}
