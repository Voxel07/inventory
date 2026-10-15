package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.*;
import java.util.*;

@ApplicationScoped
public class PositionOrm {
    @jakarta.inject.Inject protected org.ash.inventory.helper.security.ActorService accessActor;
    private final EntityManager em;
    public PositionOrm(EntityManager em) { this.em = em; }
    public List<InventoryPosition> positions(Item item) {
        return em.createQuery("from InventoryPosition p left join fetch p.lot where p.item = :item order by p.lot.expiryDate nulls last, p.lot.bestBeforeDate nulls last, p.id", InventoryPosition.class)
                .setParameter("item", item).getResultList();
    }
    public List<InventoryPosition> positions(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return em.createQuery("from InventoryPosition p join fetch p.item left join fetch p.lot join fetch p.location location left join fetch location.warehouse where p.item.id in :ids order by p.lot.expiryDate nulls last, p.lot.bestBeforeDate nulls last, p.id", InventoryPosition.class)
                .setParameter("ids", itemIds).getResultList();
    }
    public InventoryPosition position(Item item, StorageLocation location, InventoryLot lot) {
        var existing = positions(item).stream().filter(p -> p.location.id.equals(location.id)
                && Objects.equals(p.lot == null ? null : p.lot.id, lot == null ? null : lot.id)).findFirst().orElse(null);
        if (existing != null) return existing;
        var value = new InventoryPosition(); value.item = item; value.location = location; value.lot = lot; em.persist(value); return value;
    }
    public <T> T find(Class<T> type, UUID id) { return accessActor.protect(em.find(type, id), false); }
    public void lock(Item item) { em.lock(item, LockModeType.PESSIMISTIC_WRITE); }
    /**
     * Open faction reservations and prepared general-order lines per item and source location, from two grouped
     * queries regardless of the number of locations. A reservation without source counts at the item's default
     * location. {@code exceptFaction}/{@code exceptGeneral} exclude the order being (re)prepared.
     */
    public Map<UUID, Map<UUID, Integer>> reservedByLocation(Collection<UUID> itemIds, UUID exceptFaction, UUID exceptGeneral) {
        var result = new HashMap<UUID, Map<UUID, Integer>>();
        if (itemIds.isEmpty()) return result;
        for (var row : em.createQuery("""
                select i.id, coalesce(l.id, d.id), r.order.id, sum(r.reservedQuantity - r.releasedQuantity)
                from StockReservation r join r.item i left join r.location l left join i.storageLocation d
                where i.id in :ids and r.status in :statuses group by i.id, coalesce(l.id, d.id), r.order.id
                """, Object[].class).setParameter("ids", itemIds).setParameter("statuses", openReservationStatuses()).getResultList()) {
            if (row[1] != null && !row[2].equals(exceptFaction)) add(result, row);
        }
        for (var row : em.createQuery("""
                select i.id, coalesce(l.id, d.id), o.id, sum(line.preparedQuantity)
                from GeneralOrderLine line join line.order o join line.item i left join line.sourceLocation l left join i.storageLocation d
                where i.id in :ids and o.status in ('preparing', 'ready') and line.preparedQuantity > 0
                group by i.id, coalesce(l.id, d.id), o.id
                """, Object[].class).setParameter("ids", itemIds).getResultList()) {
            if (row[1] != null && !row[2].equals(exceptGeneral)) add(result, row);
        }
        return result;
    }
    private static void add(Map<UUID, Map<UUID, Integer>> result, Object[] row) {
        int quantity = ((Number) row[3]).intValue();
        if (quantity > 0) result.computeIfAbsent((UUID) row[0], ignored -> new HashMap<>()).merge((UUID) row[1], quantity, Integer::sum);
    }
    private List<DomainEnums.ReservationStatus> openReservationStatuses() {
        return List.of(DomainEnums.ReservationStatus.active, DomainEnums.ReservationStatus.partially_released);
    }
}
