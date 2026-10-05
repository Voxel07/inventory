package org.ash.inventory.service;

import org.ash.inventory.helper.BusinessTime;
import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.PositionOrm;
import org.ash.inventory.resource.ApiException;
import java.time.LocalDate;
import java.util.*;

/** Location movements run inside the same item lock and transaction as the stock ledger. */
@ApplicationScoped
public class PositionService {
    @jakarta.inject.Inject EquipmentService equipment;
    private final PositionOrm orm;
    public PositionService(PositionOrm orm) { this.orm = orm; }

    public StorageLocation location(UUID id) {
        if (id == null) return null;
        var value = orm.find(StorageLocation.class, id);
        if (value == null) throw ApiException.notFound("Storage location not found");
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

    public int availableAt(Item item, StorageLocation source, UUID exceptFaction, UUID exceptGeneral) {
        if (source == null) return Integer.MAX_VALUE;
        return Math.max(0, orm.positions(item).stream().filter(p -> p.location.id.equals(source.id))
                .mapToInt(InventoryPosition::availableQuantity).sum() - orm.reserved(item, source, exceptFaction, exceptGeneral));
    }

    public int reservedAt(InventoryPosition position) {
        int left = orm.reserved(position.item, position.location, null, null);
        for (var p : orm.positions(position.item)) {
            if (!p.location.id.equals(position.location.id)) continue;
            int reserved = Math.min(left, p.availableQuantity());
            if (p.id.equals(position.id)) return reserved;
            left -= reserved;
        }
        return 0;
    }

    /** Same FEFO allocation as reservedAt(position), materialized once for a report batch. */
    public Map<UUID, Integer> reservedAt(List<Item> items, List<InventoryPosition> orderedPositions) {
        var itemById = items.stream().collect(java.util.stream.Collectors.toMap(i -> i.id, i -> i));
        var remaining = new HashMap<String, Integer>();
        for (var reservation : orm.reservations(itemById.keySet())) {
            var source = reservation.location == null ? reservation.item.storageLocation : reservation.location;
            if (source != null) remaining.merge(reservation.item.id + ":" + source.id, reservation.openQuantity(), Integer::sum);
        }
        for (var order : orm.reservedGeneralOrders()) order.preparedQuantities.forEach((id, quantity) -> {
            var item = itemById.get(UUID.fromString(id));
            if (item == null) return;
            String source = order.sourceLocations.get(id);
            if (source == null && item.storageLocation != null) source = item.storageLocation.id.toString();
            if (source != null) remaining.merge(id + ":" + source, quantity, Integer::sum);
        });
        var result = new LinkedHashMap<UUID, Integer>();
        for (var position : orderedPositions) {
            String key = position.item.id + ":" + position.location.id;
            int left = remaining.getOrDefault(key, 0);
            int amount = Math.min(left, position.availableQuantity());
            result.put(position.id, amount); remaining.put(key, left - amount);
        }
        return result;
    }

    public void reportDamage(DamageReport report) {
        if (report.item == null || report.item.trackingMode == DomainEnums.TrackingMode.serialized) return;
        int left = report.quantity;
        var held = new LinkedHashMap<String, Integer>();
        for (var p : orm.positions(report.item)) {
            int amount = Math.min(left, Math.max(0, p.quantityOnHand - p.quantityDamaged));
            if (amount <= 0) continue;
            p.quantityDamaged += amount; held.put(p.id.toString(), amount); left -= amount;
            if (left == 0) break;
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
        if (tx.item.trackingMode == DomainEnums.TrackingMode.serialized || tx.custodyWriteOff) return;
        if (resolveLocatedDamage(tx)) return;
        int direction = switch (tx.type) {
            case added, adjusted, checkin -> 1;
            case checkout, written_off -> -1;
            default -> 0;
        };
        if (direction == 0) return;
        if (direction > 0) {
            var destination = tx.destinationLocation == null ? tx.item.storageLocation : tx.destinationLocation;
            if (destination == null) return; // Unlocated stock remains visible in the item total.
            tx.destinationLocation = destination;
            var p = orm.position(tx.item, destination, tx.lot);
            p.quantityOnHand += tx.quantity;
            tx.positionQuantities = Map.of(p.id.toString(), tx.quantity);
            return;
        }
        var source = tx.sourceLocation == null ? tx.item.storageLocation : tx.sourceLocation;
        if (tx.type == DomainEnums.TransactionType.checkout) equipment.assertSource(tx.item, source);
        var all = orm.positions(tx.item);
        if (tx.type == DomainEnums.TransactionType.checkout && source != null
                && tx.quantity > availableAt(tx.item, source, tx.factionOrder == null ? null : tx.factionOrder.id, null)) {
            throw ApiException.conflict("Stock at the source is reserved or unavailable");
        }
        if (source == null && all.isEmpty() && tx.item.trackingMode != DomainEnums.TrackingMode.lot_tracked) return;
        int remaining = tx.quantity; var allocations = new LinkedHashMap<String, Integer>();
        for (var p : all) {
            if (source != null && !p.location.id.equals(source.id)) continue;
            if (tx.lot != null && (p.lot == null || !p.lot.id.equals(tx.lot.id))) continue;
            boolean loss = tx.type == DomainEnums.TransactionType.written_off;
            if (!loss && (!usable(p.lot) || (tx.item.trackingMode == DomainEnums.TrackingMode.lot_tracked && p.lot == null))) continue;
            int available = loss ? p.quantityOnHand : p.availableQuantity();
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
}
