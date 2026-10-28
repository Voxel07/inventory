package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.DamageReport;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.PositionOrm;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.*;

/** Location movements run inside the same item lock and transaction as the stock ledger. */
@ApplicationScoped
public class PositionService {
    @jakarta.inject.Inject IssueAllocationService issueAllocations;
    @jakarta.inject.Inject EquipmentPolicy equipment;
    private final PositionOrm orm;
    public PositionService(PositionOrm orm) { this.orm = orm; }

    /** A location stock is booked into or taken from; top-level locations hold none. */
    public StorageLocation location(UUID id) {
        if (id == null) return null;
        var value = orm.find(StorageLocation.class, id);
        if (value == null) throw ApiException.notFound("Storage location not found");
        LocationHierarchyService.requireStockLocation(value);
        return value;
    }
    public InventoryLot lot(Item item, UUID id) {
        if (id == null) return null;
        var value = orm.find(InventoryLot.class, id);
        if (value == null || !value.item.id.equals(item.id)) throw ApiException.badRequest("Lot does not belong to item");
        return value;
    }
    public static boolean usable(InventoryLot lot) {
        return lot == null || lot.usableOn(BusinessTime.today());
    }

    public int blocked(Item item) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) return 0;
        return blocked(item, orm.positions(item));
    }

    public static int blocked(Item item, List<InventoryPosition> positions) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) return 0;
        return positions.stream().mapToInt(p -> usable(p.lot)
                && (item.trackingMode != DomainEnums.TrackingMode.lot_tracked || p.lot != null)
                ? p.quantityQuarantined : Math.max(0, p.quantityOnHand - p.quantityDamaged)).sum();
    }

    public Map<UUID, List<InventoryPosition>> load(Collection<UUID> itemIds) {
        return orm.positions(itemIds).stream().collect(java.util.stream.Collectors.groupingBy(p -> p.item.id));
    }

    public int inTransit(Item item) {
        return orm.positions(item).stream().mapToInt(p -> p.quantityInTransit).sum();
    }

    /** Exact position capacity plus usable unlocated bulk stock, excluding the current order's reservations. */
    public record Capacity(List<InventoryPosition> positions, Map<UUID, Integer> reserved, int unlocatedAvailable) {
        public int availableAt(StorageLocation source) {
            if (source == null) return Integer.MAX_VALUE;
            return Math.max(0, positions.stream().filter(p -> p.location.id.equals(source.id))
                    .mapToInt(p -> Math.max(0, p.availableQuantity() - reservedAt(p))).sum());
        }

        /** Locations currently holding stock of the item, in FEFO position order. */
        public List<StorageLocation> stockLocations() {
            var result = new ArrayList<StorageLocation>();
            for (var p : positions)
                if (p.quantityOnHand > 0 && result.stream().noneMatch(l -> l.id.equals(p.location.id))) result.add(p.location);
            return result;
        }

        /** Outstanding reservations held by this exact position. */
        public int reservedAt(InventoryPosition position) {
            return reserved.getOrDefault(position.id, 0);
        }
    }

    public Capacity capacity(Item item, UUID exceptOrder) {
        return new Capacity(orm.positions(item),
                orm.reservedByPosition(List.of(item.id), exceptOrder),
                item.trackingMode == DomainEnums.TrackingMode.bulk && item.storageLocation == null
                        ? orm.unlocatedAvailable(item, exceptOrder) : 0);
    }

    public int availableAt(Item item, StorageLocation source, UUID exceptOrder) {
        if (source == null) return Integer.MAX_VALUE;
        return capacity(item, exceptOrder).availableAt(source);
    }

    public int reservedAt(InventoryPosition position) {
        return capacity(position.item, null).reservedAt(position);
    }

    /** Same FEFO allocation as reservedAt(position), materialized once for a report batch. */
    public Map<UUID, Integer> reservedAt(List<Item> items, List<InventoryPosition> orderedPositions) {
        return orm.reservedByPosition(items.stream().map(item -> item.id).toList(), null);
    }

    public void reportDamage(DamageReport report, UUID positionId) {
        if (report.item == null || report.item.trackingMode == DomainEnums.TrackingMode.serialized) {
            if (positionId != null) throw ApiException.badRequest("Select a stock position only for bulk or lot damage");
            return;
        }
        var candidates = orm.positions(report.item).stream()
                .filter(p -> p.quantityOnHand - p.quantityDamaged - p.quantityQuarantined > 0).toList();
        if (positionId == null && candidates.size() > 1)
            throw ApiException.badRequest("Select the physical stock position where the damage occurred");
        var position = positionId == null ? candidates.stream().findFirst().orElse(null)
                : candidates.stream().filter(p -> p.id.equals(positionId)).findFirst()
                    .orElseThrow(() -> ApiException.badRequest("Damage position does not hold undamaged stock of this item"));
        if (position == null) {
            int alreadyDamaged = orm.unlocatedDamage(report.item).stream().filter(d -> d != report)
                    .mapToInt(d -> d.quantity - d.repairedQuantity - d.writtenOffQuantity).sum();
            if (report.item.trackingMode != DomainEnums.TrackingMode.bulk || orm.unlocatedBulk(report.item) - alreadyDamaged < report.quantity)
                throw ApiException.conflict("No stored stock matches the damage; report issued damage through its custody/return workflow");
            return;
        }
        orm.find(InventoryPosition.class, position.id); // Enforce the selected place's permissions as well.
        if (report.quantity > position.quantityOnHand - position.quantityDamaged - position.quantityQuarantined)
            throw ApiException.badRequest("Damage exceeds stock at the selected position");
        position.quantityDamaged += report.quantity;
        report.positionQuantities = Map.of(position.id.toString(), report.quantity);
    }

    /** Returned damage belongs to the exact positions credited by its check-in. */
    public void reportReturnedDamage(DamageReport report, StockTransaction checkin) {
        var held = new LinkedHashMap<String, Integer>();
        for (var entry : checkin.positionQuantities.entrySet()) {
            var position = orm.find(InventoryPosition.class, UUID.fromString(entry.getKey()));
            position.quantityDamaged += entry.getValue();
            held.put(entry.getKey(), entry.getValue());
        }
        report.positionQuantities = held;
    }

    private boolean resolveLocatedDamage(StockTransaction tx) {
        if (tx.damageReport == null || tx.damageReport.positionQuantities.isEmpty()
                || (tx.type != DomainEnums.TransactionType.repaired && tx.type != DomainEnums.TransactionType.written_off)) return false;
        orm.lock(tx.item);
        int left = tx.quantity; var held = new LinkedHashMap<>(tx.damageReport.positionQuantities);
        var moved = new LinkedHashMap<String, Integer>();
        for (var entry : new ArrayList<>(held.entrySet())) {
            var p = orm.find(InventoryPosition.class, UUID.fromString(entry.getKey()));
            int amount = Math.min(left, entry.getValue());
            p.quantityDamaged = Math.max(0, p.quantityDamaged - amount);
            if (tx.type == DomainEnums.TransactionType.written_off) {
                if (p.quantityOnHand < amount) throw ApiException.conflict("Damaged stock changed location; recount before writing off");
                p.quantityOnHand -= amount; moved.put(entry.getKey(), -amount);
                tx.sourceLocation = p.location;
            }
            held.put(entry.getKey(), entry.getValue() - amount); left -= amount;
            if (left == 0) break;
        }
        if (left > 0) throw ApiException.conflict("Resolution exceeds located damage; reconcile location stock first");
        tx.damageReport.positionQuantities = held; tx.positionQuantities = moved;
        return true;
    }

    public void apply(StockTransaction tx) {
        if (tx.item.trackingMode == DomainEnums.TrackingMode.serialized) {
            if (tx.type == DomainEnums.TransactionType.checkin) LocationHierarchyService.requireActiveStockLocation(tx.destinationLocation);
            return;
        }
        if (tx.type == DomainEnums.TransactionType.checkin || tx.custodyWriteOff) {
            issueAllocations.settle(tx);
            return;
        }
        if (resolveLocatedDamage(tx)) return;
        int direction = switch (tx.type) {
            case added, adjusted, checkin -> 1;
            case checkout, written_off -> -1;
            default -> 0;
        };
        if (direction == 0) return;
        if (direction > 0) {
            var destination = tx.destinationLocation == null ? tx.item.storageLocation : tx.destinationLocation;
            if (tx.item.trackingMode == DomainEnums.TrackingMode.lot_tracked && (destination == null || tx.lot == null))
                throw ApiException.badRequest("Lot-tracked stock requires a lot and a receiving location");
            if (destination == null) return; // Unlocated stock remains visible in the item total.
            LocationHierarchyService.requireActiveStockLocation(destination);
            tx.destinationLocation = destination;
            var p = orm.position(tx.item, destination, tx.lot);
            p.quantityOnHand += tx.quantity;
            tx.positionQuantities = Map.of(p.id.toString(), tx.quantity);
            return;
        }
        var source = tx.sourceLocation == null ? tx.item.storageLocation : tx.sourceLocation;
        if (tx.type == DomainEnums.TransactionType.checkout) equipment.assertSource(tx.item, source);
        if (tx.order != null && tx.type == DomainEnums.TransactionType.checkout && source == null
                && tx.item.trackingMode == DomainEnums.TrackingMode.bulk) {
            if (tx.quantity > orm.unlocatedAvailable(tx.item, tx.order.id))
                throw ApiException.conflict("Unlocated stock is reserved or unavailable");
            return; // A null order source explicitly issues its unlocated reservation, never another bin.
        }
        var all = orm.positions(tx.item);
        var reserved = orm.reservedByPosition(List.of(tx.item.id), tx.order == null ? null : tx.order.id);
        if (tx.type == DomainEnums.TransactionType.checkout && source != null
                && tx.quantity > availableAt(tx.item, source, tx.order == null ? null : tx.order.id)) {
            throw ApiException.conflict("Stock at the source is reserved or unavailable");
        }
        if (source == null && all.isEmpty() && tx.item.trackingMode != DomainEnums.TrackingMode.lot_tracked) return;
        int remaining = tx.quantity; var allocations = new LinkedHashMap<String, Integer>();
        for (var p : all) {
            if (source != null && !p.location.id.equals(source.id)) continue;
            if (tx.lot != null && (p.lot == null || !p.lot.id.equals(tx.lot.id))) continue;
            boolean loss = tx.type == DomainEnums.TransactionType.written_off;
            if (!loss && (!usable(p.lot) || (tx.item.trackingMode == DomainEnums.TrackingMode.lot_tracked && p.lot == null))) continue;
            int available = loss ? p.quantityOnHand : Math.max(0, p.availableQuantity() - reserved.getOrDefault(p.id, 0));
            int quantity = Math.min(remaining, available);
            if (quantity <= 0) continue;
            // One checkout uses one physical source, with FEFO across its lots.
            if (source == null) source = p.location;
            p.quantityOnHand -= quantity;
            if (loss) p.quantityDamaged = Math.max(0, p.quantityDamaged - quantity);
            allocations.put(p.id.toString(), -quantity); remaining -= quantity;
            if (remaining == 0) break;
        }
        if (remaining > 0) throw ApiException.conflict("Insufficient usable stock at the selected source for " + tx.item.name + "; transfer stock or choose another location");
        tx.sourceLocation = source; tx.positionQuantities = allocations;
    }

    /** Assigning a home puts previously unlocated bulk stock away without increasing owned stock. */
    public void putAwayUnlocated(Item item, org.ash.inventory.operations.internal.model.UserAccount actor) {
        if (item.trackingMode != DomainEnums.TrackingMode.bulk || item.storageLocation == null) return;
        int quantity = orm.unlocatedBulk(item);
        if (quantity == 0) return;
        LocationHierarchyService.requireActiveStockLocation(item.storageLocation);
        var target = orm.position(item, item.storageLocation, null);
        target.quantityOnHand = Math.addExact(target.quantityOnHand, quantity);
        for (var damage : orm.unlocatedDamage(item)) {
            int unresolved = damage.quantity - damage.repairedQuantity - damage.writtenOffQuantity;
            target.quantityDamaged = Math.addExact(target.quantityDamaged, unresolved);
            damage.positionQuantities = Map.of(target.id.toString(), unresolved);
        }
        var tx = new StockTransaction();
        tx.item = item; tx.user = actor; tx.type = DomainEnums.TransactionType.putaway; tx.quantity = quantity;
        tx.destinationLocation = item.storageLocation;
        tx.reason = "Unlocated stock put away";
        tx.positionQuantities = Map.of(target.id.toString(), quantity);
        orm.persist(tx);
    }
}
