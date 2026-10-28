package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.security.ActorService;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.*;

@ApplicationScoped
public class PositionOrm {
    @jakarta.inject.Inject protected org.ash.inventory.operations.internal.security.ActorService accessActor;
    private final EntityManager em;
    public PositionOrm(EntityManager em) { this.em = em; }
    public List<InventoryPosition> positions(Item item) {
        return em.createQuery("from InventoryPosition p left join fetch p.lot join fetch p.location location left join fetch location.accessPolicy where p.item = :item order by p.lot.expiryDate nulls last, p.id", InventoryPosition.class)
                .setParameter("item", item).getResultList();
    }
    public List<InventoryPosition> positions(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return em.createQuery("from InventoryPosition p join fetch p.item left join fetch p.lot join fetch p.location location where p.item.id in :ids order by p.lot.expiryDate nulls last, p.id", InventoryPosition.class)
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
    public void persist(Object value) { em.persist(value); }
    public Map<UUID, Integer> reservedByPosition(Collection<UUID> itemIds, UUID exceptOrder) {
        if (itemIds.isEmpty()) return Map.of();
        var result = new HashMap<UUID, Integer>();
        for (var row : em.createQuery("""
                select r.position.id, r.order.id, sum(r.reservedQuantity - r.releasedQuantity)
                from StockReservation r where r.item.id in :ids and r.position is not null
                and r.status in :statuses group by r.position.id, r.order.id
                """, Object[].class).setParameter("ids", itemIds).setParameter("statuses", openReservationStatuses()).getResultList())
            if (!row[1].equals(exceptOrder)) result.merge((UUID) row[0], Math.toIntExact(((Number) row[2]).longValue()), Math::addExact);
        return result;
    }
    public int unlocatedBulk(Item item) {
        long onHand = em.createQuery("""
                select coalesce(sum(case
                    when t.type in (added, received, adjusted, checkin, transfer_in) then t.quantity
                    when t.type in (checkout, transfer_out) or (t.type = written_off and t.custodyWriteOff = false) then -t.quantity
                    else 0 end), 0) from StockTransaction t where t.item = :item
                """, Long.class).setParameter("item", item).getSingleResult();
        int located = positions(item).stream().mapToInt(p -> p.quantityOnHand).sum();
        return Math.toIntExact(Math.max(0, onHand - located));
    }
    public List<org.ash.inventory.operations.internal.model.DamageReport> unlocatedDamage(Item item) {
        return em.createQuery("""
                from DamageReport d where d.item = :item and d.assetInstance is null and d.order is null
                and d.quantity > d.repairedQuantity + d.writtenOffQuantity
                """, org.ash.inventory.operations.internal.model.DamageReport.class).setParameter("item", item).getResultList()
                .stream().filter(d -> d.positionQuantities.isEmpty()).toList();
    }
    public int unlocatedAvailable(Item item, UUID exceptOrder) {
        int damaged = unlocatedDamage(item).stream().mapToInt(d -> d.quantity - d.repairedQuantity - d.writtenOffQuantity).sum();
        var query = em.createQuery("""
                select coalesce(sum(r.reservedQuantity - r.releasedQuantity), 0) from StockReservation r
                where r.item = :item and r.position is null and r.status in :statuses
                """ + (exceptOrder == null ? "" : " and r.order.id <> :order"), Long.class)
                .setParameter("item", item).setParameter("statuses", openReservationStatuses());
        if (exceptOrder != null) query.setParameter("order", exceptOrder);
        return Math.max(0, unlocatedBulk(item) - damaged - Math.toIntExact(query.getSingleResult()));
    }
    private List<DomainEnums.ReservationStatus> openReservationStatuses() {
        return List.of(DomainEnums.ReservationStatus.active, DomainEnums.ReservationStatus.partially_released);
    }
}
