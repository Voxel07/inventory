package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.MaintenanceSchedule;
import org.ash.inventory.model.Item;
import org.ash.inventory.orm.OperationsOrm;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;

/** Supplies live counters at the schedule's item or asset scope. */
@ApplicationScoped
public class MaintenanceEvaluationService {
    private final OperationsOrm operations;
    public MaintenanceEvaluationService(OperationsOrm operations) { this.operations = operations; }

    private MaintenancePolicy.Counters counters(MaintenanceSchedule schedule) {
        long uses = schedule.intervalType == DomainEnums.MaintenanceIntervalType.usage_count
                ? operations.checkoutCount(schedule.item, schedule.assetInstance) : 0;
        return new MaintenancePolicy.Counters(schedule.item.currentOperatingHours,
                schedule.assetInstance == null ? uses : 0,
                schedule.assetInstance == null ? null : schedule.assetInstance.operatingHours,
                schedule.assetInstance == null ? 0 : uses);
    }

    public java.util.Map<java.util.UUID, MaintenancePolicy.Status> statuses(java.util.List<MaintenanceSchedule> schedules, Instant now) {
        var ids = schedules.stream().filter(s -> s.intervalType == DomainEnums.MaintenanceIntervalType.usage_count).map(s -> s.item.id).distinct().toList();
        var itemUses = new java.util.HashMap<java.util.UUID, Long>();
        var assetUses = new java.util.HashMap<java.util.UUID, Long>();
        for (var row : operations.checkoutCounts(ids)) {
            long uses = ((Number) row[2]).longValue();
            itemUses.merge((java.util.UUID) row[0], uses, Long::sum);
            if (row[1] != null) assetUses.put((java.util.UUID) row[1], uses);
        }
        var result = new java.util.HashMap<java.util.UUID, MaintenancePolicy.Status>();
        for (var s : schedules) {
            var counters = new MaintenancePolicy.Counters(s.item.currentOperatingHours, itemUses.getOrDefault(s.item.id, 0L),
                    s.assetInstance == null ? null : s.assetInstance.operatingHours,
                    s.assetInstance == null ? 0 : assetUses.getOrDefault(s.assetInstance.id, 0L));
            result.put(s.id, MaintenancePolicy.status(MaintenancePolicy.facts(s), now, counters));
        }
        return result;
    }
    public MaintenancePolicy.Status status(MaintenanceSchedule schedule, Instant now) {
        return MaintenancePolicy.status(MaintenancePolicy.facts(schedule), now, counters(schedule));
    }
    public BigDecimal meter(MaintenanceSchedule schedule) {
        return MaintenancePolicy.meter(MaintenancePolicy.facts(schedule), counters(schedule));
    }

    public boolean itemUsable(Item item, Instant now) {
        return !MaintenancePolicy.blocksItem(item.active, item.maintenanceStatus, item.nextMaintenanceDue, now.atZone(ZoneId.systemDefault()).toLocalDate())
                && operations.blockingSchedules(item, null).stream().noneMatch(s -> MaintenancePolicy.blocksCheckout(status(s, now)));
    }
}
