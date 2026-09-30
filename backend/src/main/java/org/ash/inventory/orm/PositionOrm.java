package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.*;
import java.util.*;

@ApplicationScoped
public class PositionOrm {
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
    public List<StockReservation> reservations(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return em.createQuery("from StockReservation r join fetch r.item i left join fetch i.storageLocation left join fetch r.location where r.item.id in :ids and r.status in :statuses", StockReservation.class)
                .setParameter("ids", itemIds).setParameter("statuses", openReservationStatuses()).getResultList();
    }
    public List<GeneralOrder> reservedGeneralOrders() {
        return em.createQuery("from GeneralOrder o where o.status in ('preparing', 'ready')", GeneralOrder.class).getResultList();
    }
    public InventoryPosition position(Item item, StorageLocation location, InventoryLot lot) {
        var existing = positions(item).stream().filter(p -> p.location.id.equals(location.id)
                && Objects.equals(p.lot == null ? null : p.lot.id, lot == null ? null : lot.id)).findFirst().orElse(null);
        if (existing != null) return existing;
        var value = new InventoryPosition(); value.item = item; value.location = location; value.lot = lot; em.persist(value); return value;
    }
    public <T> T find(Class<T> type, UUID id) { return em.find(type, id); }
    public void lock(Item item) { em.lock(item, LockModeType.PESSIMISTIC_WRITE); }
    public int reserved(Item item, StorageLocation location, UUID exceptFaction, UUID exceptGeneral) {
        int result = 0;
        for (var r : em.createQuery("from StockReservation r where r.item = :item and r.status in :statuses", StockReservation.class)
                .setParameter("item", item).setParameter("statuses", openReservationStatuses()).getResultList()) {
            if (exceptFaction != null && r.order.id.equals(exceptFaction)) continue;
            var source = r.location == null ? item.storageLocation : r.location;
            if (source != null && source.id.equals(location.id)) result += r.openQuantity();
        }
        for (var order : em.createQuery("from GeneralOrder o where o.status in ('preparing', 'ready')", GeneralOrder.class).getResultList()) {
            if (order.id.equals(exceptGeneral)) continue;
            String source = order.sourceLocations.get(item.id.toString());
            if (source == null && item.storageLocation != null) source = item.storageLocation.id.toString();
            if (location.id.toString().equals(source)) result += order.preparedQuantities.getOrDefault(item.id.toString(), 0);
        }
        return result;
    }
    private List<DomainEnums.ReservationStatus> openReservationStatuses() {
        return List.of(DomainEnums.ReservationStatus.active, DomainEnums.ReservationStatus.partially_released);
    }
}
