package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EquipmentCommitment;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.LoanArrangement;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.operations.internal.persistence.EquipmentOrm;
import org.ash.inventory.operations.internal.persistence.OperationsOrm;
import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
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
        return load(items, assets, positions, new HashSet<>(equipment.openMemberDamage(items.stream().map(i -> i.id).toList())));
    }

    public Map<UUID, Facts> load(List<Item> items, Map<UUID, List<AssetInstance>> assets,
            Map<UUID, List<InventoryPosition>> positions, Set<UUID> damaged) {
        if (items.isEmpty()) return Map.of();
        var ids = items.stream().map(i -> i.id).toList();
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
        var restrictedIds = items.stream().filter(i -> i.accessPolicy == null && i.availabilityPolicy == Item.AvailabilityPolicy.commitment_required).map(i -> i.id).toList();
        var commitments = equipment.commitments(restrictedIds);
        var byItem = commitments.stream().collect(Collectors.groupingBy(c -> c.item.id));
        var loans = new HashMap<UUID, LoanArrangement>();
        equipment.loans(commitments.stream().map(c -> c.id).toList()).forEach(l -> loans.putIfAbsent(l.commitment.id, l));
        var consumed = equipment.consumption(items.stream().filter(i -> i.consumable() && restrictedIds.contains(i.id)).map(i -> i.id).toList())
                .stream().collect(Collectors.groupingBy(t -> t.item.id));
        var now = Instant.now();
        var result = new LinkedHashMap<UUID, Facts>();
        for (var item : items) {
            var itemSchedules = schedules.getOrDefault(item.id, List.<MaintenanceSchedule>of());
            var eligibility = new AvailabilityEligibility(item, now, itemSchedules.stream().filter(s -> s.checkoutBlocking)
                    .map(MaintenancePolicy::facts).toList(), itemUses.getOrDefault(item.id, 0L), assetUses);
            result.put(item.id, new Facts(item, damaged.contains(item.id), eligibility,
                    assets.getOrDefault(item.id, List.of()), positions.getOrDefault(item.id, List.of()), itemSchedules,
                    byItem.getOrDefault(item.id, List.of()), loans, consumed.getOrDefault(item.id, List.of())));
        }
        return result;
    }

    public record Facts(Item item, boolean hasMemberDamage, AvailabilityEligibility eligibility, List<AssetInstance> assets,
            List<InventoryPosition> positions, List<MaintenanceSchedule> schedules,
            List<EquipmentCommitment> commitments, Map<UUID, LoanArrangement> loans,
            List<StockTransaction> consumption)
            implements EquipmentPolicy.AvailabilityData {
        public boolean itemUsable() { return eligibility.itemUsable(); }
        public boolean usable(AssetInstance asset) { return eligibility.usable(asset); }
        public MaintenancePolicy.Status status(MaintenanceSchedule schedule) {
            return eligibility.status(MaintenancePolicy.facts(schedule), schedule.assetInstance);
        }
        public MaintenancePolicy.Counters counters(MaintenanceSchedule schedule) {
            return eligibility.counters(schedule.assetInstance);
        }
        public LoanArrangement loan(EquipmentCommitment commitment) { return loans.get(commitment.id); }
        public int consumedDuring(EquipmentCommitment commitment) {
            return consumption.stream().filter(t -> !BusinessTime.date(t.createdAt).isBefore(commitment.availableFrom))
                    .mapToInt(t -> t.quantity).sum();
        }
        public int internalQuantity(UUID providerId) {
            return positions.stream().filter(p -> !p.location.id.equals(providerId)).mapToInt(InventoryPosition::availableQuantity).sum();
        }
    }
}
