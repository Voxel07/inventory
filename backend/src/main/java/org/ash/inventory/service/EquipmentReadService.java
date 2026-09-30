package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.EquipmentOrm;
import org.ash.inventory.orm.OperationsOrm;
import java.time.Instant;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/** Materialized, request-local policy facts. No database calls occur during availability evaluation. */
@ApplicationScoped
public class EquipmentReadService {
    private final EquipmentOrm equipment;
    private final OperationsOrm operations;
    public EquipmentReadService(EquipmentOrm equipment, OperationsOrm operations) {
        this.equipment = equipment; this.operations = operations;
    }

    public Map<UUID, Facts> load(List<Item> items, Map<UUID, List<AssetInstance>> assets,
            Map<UUID, List<InventoryPosition>> positions) {
        if (items.isEmpty()) return Map.of();
        var ids = items.stream().map(i -> i.id).toList();
        var damaged = new HashSet<>(equipment.openMemberDamage(ids));
        var schedules = operations.schedules(ids).stream().collect(Collectors.groupingBy(s -> s.item.id));
        var itemUses = new HashMap<UUID, Long>();
        var assetUses = new HashMap<UUID, Long>();
        var usageIds = schedules.values().stream().flatMap(List::stream)
                .filter(s -> s.intervalType == DomainEnums.MaintenanceIntervalType.usage_count).map(s -> s.item.id).distinct().toList();
        for (var row : operations.checkoutCounts(usageIds)) {
            long count = ((Number) row[2]).longValue();
            itemUses.merge((UUID) row[0], count, Long::sum);
            if (row[1] != null) assetUses.put((UUID) row[1], count);
        }
        var restrictedIds = items.stream().filter(i -> i.availabilityPolicy == Item.AvailabilityPolicy.commitment_required).map(i -> i.id).toList();
        var commitments = equipment.commitments(restrictedIds);
        var byItem = commitments.stream().collect(Collectors.groupingBy(c -> c.item.id));
        var loans = new HashMap<UUID, LoanArrangement>();
        equipment.loans(commitments.stream().map(c -> c.id).toList()).forEach(l -> loans.putIfAbsent(l.commitment.id, l));
        var consumed = equipment.consumption(items.stream().filter(i -> i.consumable && restrictedIds.contains(i.id)).map(i -> i.id).toList())
                .stream().collect(Collectors.groupingBy(t -> t.item.id));
        var now = Instant.now();
        var result = new LinkedHashMap<UUID, Facts>();
        for (var item : items) result.put(item.id, new Facts(item, now, damaged.contains(item.id),
                assets.getOrDefault(item.id, List.of()), positions.getOrDefault(item.id, List.of()),
                schedules.getOrDefault(item.id, List.of()), byItem.getOrDefault(item.id, List.of()),
                loans, consumed.getOrDefault(item.id, List.of()), itemUses.getOrDefault(item.id, 0L), assetUses));
        return result;
    }

    public record Facts(Item item, Instant now, boolean hasMemberDamage, List<AssetInstance> assets,
            List<InventoryPosition> positions, List<MaintenanceSchedule> schedules,
            List<EquipmentCommitment> commitments, Map<UUID, LoanArrangement> loans,
            List<StockTransaction> consumption, long itemUses, Map<UUID, Long> assetUses)
            implements EquipmentService.AvailabilityData {
        public boolean itemUsable() {
            return !MaintenancePolicy.blocksItem(item.active, item.maintenanceStatus, item.nextMaintenanceDue,
                    now.atZone(ZoneId.systemDefault()).toLocalDate()) && !scheduleBlocked(null);
        }
        public boolean usable(AssetInstance asset) {
            return asset.active && asset.conditionStatus != DomainEnums.ConditionStatus.damaged
                    && asset.conditionStatus != DomainEnums.ConditionStatus.unsafe && asset.conditionStatus != DomainEnums.ConditionStatus.lost
                    && asset.serviceStatus != DomainEnums.MaintenanceStatus.overdue && asset.serviceStatus != DomainEnums.MaintenanceStatus.in_service
                    && !scheduleBlocked(asset);
        }
        private boolean scheduleBlocked(AssetInstance asset) {
            return schedules.stream().filter(s -> s.checkoutBlocking && (s.assetInstance == null
                    || (asset != null && s.assetInstance.id.equals(asset.id))))
                    .anyMatch(s -> MaintenancePolicy.blocksCheckout(status(s)));
        }
        public MaintenancePolicy.Status status(MaintenanceSchedule schedule) {
            return MaintenancePolicy.status(MaintenancePolicy.facts(schedule), now, counters(schedule));
        }
        public MaintenancePolicy.Counters counters(MaintenanceSchedule schedule) {
            var asset = schedule.assetInstance;
            return new MaintenancePolicy.Counters(item.currentOperatingHours, itemUses,
                    asset == null ? null : asset.operatingHours, asset == null ? 0 : assetUses.getOrDefault(asset.id, 0L));
        }
        public LoanArrangement loan(EquipmentCommitment commitment) { return loans.get(commitment.id); }
        public int consumedDuring(EquipmentCommitment commitment) {
            return consumption.stream().filter(t -> !t.createdAt.atZone(ZoneId.systemDefault()).toLocalDate().isBefore(commitment.availableFrom))
                    .mapToInt(t -> t.quantity).sum();
        }
        public int internalQuantity(UUID providerId) {
            return positions.stream().filter(p -> !p.location.id.equals(providerId)).mapToInt(InventoryPosition::availableQuantity).sum();
        }
    }
}
