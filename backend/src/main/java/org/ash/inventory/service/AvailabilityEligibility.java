package org.ash.inventory.service;

import org.ash.inventory.helper.BusinessTime;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.Item;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Item and asset checkout eligibility over preloaded, immutable facts. The request-local read model and the planning
 * snapshot both evaluate through this one rule set; live commands use the same {@link MaintenancePolicy} decisions.
 *
 * @param blockingSchedules active, checkout-blocking schedules of the item (item-wide and per asset)
 * @param itemUses checkout count of the item, for item-wide usage-count schedules
 * @param assetUses checkout count per asset, for asset usage-count schedules
 */
public record AvailabilityEligibility(Item item, Instant now, List<MaintenancePolicy.Facts> blockingSchedules,
        long itemUses, Map<UUID, Long> assetUses) {
    private static final Set<DomainEnums.ConditionStatus> UNUSABLE_CONDITIONS = Set.of(
            DomainEnums.ConditionStatus.damaged, DomainEnums.ConditionStatus.unsafe, DomainEnums.ConditionStatus.lost);

    public boolean itemUsable() {
        return !MaintenancePolicy.blocksItem(item, BusinessTime.date(now))
                && blockingSchedules.stream().filter(s -> s.assetId() == null).noneMatch(s -> blocks(s, null));
    }

    /** Item-wide schedules block every asset; asset schedules block only their asset. */
    public boolean usable(AssetInstance asset) {
        return asset.active && !UNUSABLE_CONDITIONS.contains(asset.conditionStatus)
                && !MaintenancePolicy.blocksAsset(asset, BusinessTime.date(now))
                && blockingSchedules.stream().filter(s -> s.assetId() == null || s.assetId().equals(asset.id))
                .noneMatch(s -> blocks(s, asset));
    }

    public MaintenancePolicy.Status status(MaintenancePolicy.Facts schedule, AssetInstance asset) {
        return MaintenancePolicy.status(schedule, now, counters(asset));
    }

    public MaintenancePolicy.Counters counters(AssetInstance asset) {
        return new MaintenancePolicy.Counters(item.currentOperatingHours, itemUses,
                asset == null ? null : asset.operatingHours, asset == null ? 0 : assetUses.getOrDefault(asset.id, 0L));
    }

    private boolean blocks(MaintenancePolicy.Facts schedule, AssetInstance asset) {
        return MaintenancePolicy.blocksCheckout(status(schedule, asset));
    }
}
