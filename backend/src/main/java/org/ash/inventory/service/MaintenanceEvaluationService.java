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
