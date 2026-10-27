package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One schedule evaluation for checkout eligibility and report projections. */
public final class MaintenancePolicy {
    private MaintenancePolicy() {}
    public enum Status { unknown, due, warning, healthy }

    public record Facts(UUID assetId, DomainEnums.MaintenanceIntervalType intervalType,
            Instant dueAt, BigDecimal dueValue, BigDecimal warningWindow) {}
    public record Counters(BigDecimal itemHours, long itemUses, BigDecimal assetHours, long assetUses) {}

    public static Facts facts(MaintenanceSchedule schedule) {
        return new Facts(schedule.assetInstance == null ? null : schedule.assetInstance.id,
                schedule.intervalType, schedule.nextDueAt, schedule.nextDueValue, schedule.warningWindow);
    }

    public static BigDecimal meter(Facts facts, Counters counters) {
        return switch (facts.intervalType()) {
            case date -> null;
            case operating_hours -> facts.assetId() == null ? counters.itemHours() : counters.assetHours();
            case usage_count -> BigDecimal.valueOf(facts.assetId() == null ? counters.itemUses() : counters.assetUses());
        };
    }

    public static Status status(Facts facts, Instant now, Counters counters) {
        if (facts.intervalType() == DomainEnums.MaintenanceIntervalType.date) {
            if (facts.dueAt() == null) return Status.unknown;
            if (!facts.dueAt().isAfter(now)) return Status.due;
            if (facts.warningWindow() == null) return Status.unknown;
            var remaining = Duration.between(now, facts.dueAt());
            var seconds = BigDecimal.valueOf(remaining.getSeconds()).add(BigDecimal.valueOf(remaining.getNano(), 9));
            return seconds.compareTo(facts.warningWindow().multiply(BigDecimal.valueOf(86400))) <= 0 ? Status.warning : Status.healthy;
        }
        var meter = meter(facts, counters);
        if (meter == null || facts.dueValue() == null) return Status.unknown;
        if (meter.compareTo(facts.dueValue()) >= 0) return Status.due;
        if (facts.warningWindow() == null) return Status.unknown;
        return meter.add(facts.warningWindow()).compareTo(facts.dueValue()) >= 0 ? Status.warning : Status.healthy;
    }

    public static boolean blocksCheckout(Status status) { return status == Status.due || status == Status.unknown; }

    /** Days before a calendar due date in which item and asset calendars report {@code due_soon}. */
    public static final int CALENDAR_WARNING_DAYS = 30;
    public static DomainEnums.MaintenanceStatus itemStatus(Item item, LocalDate today) {
        return item.outOfService ? DomainEnums.MaintenanceStatus.in_service : DomainEnums.MaintenanceStatus.certified;
    }
    public static DomainEnums.MaintenanceStatus assetStatus(AssetInstance asset, LocalDate today) {
        return asset.outOfService ? DomainEnums.MaintenanceStatus.in_service : DomainEnums.MaintenanceStatus.certified;
    }
    public static boolean blocksItem(Item item, LocalDate today) { return !item.active || item.outOfService; }
    public static boolean blocksAsset(AssetInstance asset, LocalDate today) { return asset.outOfService; }
}
