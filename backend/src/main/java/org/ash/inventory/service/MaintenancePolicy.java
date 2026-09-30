package org.ash.inventory.service;

import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.MaintenanceSchedule;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;

/** One schedule evaluation for checkout eligibility and report projections. */
public final class MaintenancePolicy {
    private MaintenancePolicy() {}
    public enum Status { unknown, due, warning, healthy }

    public static Status status(MaintenanceSchedule schedule, Instant now, BigDecimal meter) {
        if (schedule.intervalType == DomainEnums.MaintenanceIntervalType.date) {
            if (schedule.nextDueAt == null) return Status.unknown;
            double days = Duration.between(now, schedule.nextDueAt).toSeconds() / 86400.0;
            return days <= 0 ? Status.due : days <= schedule.warningWindow.doubleValue() ? Status.warning : Status.healthy;
        }
        if (meter == null || schedule.nextDueValue == null) return Status.unknown;
        return meter.compareTo(schedule.nextDueValue) >= 0 ? Status.due
                : meter.add(schedule.warningWindow).compareTo(schedule.nextDueValue) >= 0 ? Status.warning : Status.healthy;
    }

    public static boolean blocksCheckout(Status status) { return status == Status.due || status == Status.unknown; }
}
