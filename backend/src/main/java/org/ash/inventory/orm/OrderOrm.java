package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItem;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderHistory;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.StockReservation;

import java.util.List;
import java.util.UUID;

/** Database access for faction orders and their related models. */
@ApplicationScoped
public class OrderOrm {
    @Inject EntityManager entityManager;

    public List<FactionOrder> orders(String eventType, String faction) {
        var jpql = new StringBuilder("from FactionOrder o where 1 = 1");
        if (eventType != null && !eventType.isBlank()) jpql.append(" and o.eventOccurrence.eventType = :eventType");
        if (faction != null && !faction.isBlank()) jpql.append(" and o.faction.name = :faction");
        jpql.append(" order by o.eventOccurrence.startDate desc");
        var query = entityManager.createQuery(jpql.toString(), FactionOrder.class);
        if (eventType != null && !eventType.isBlank()) query.setParameter("eventType", eventType);
        if (faction != null && !faction.isBlank()) query.setParameter("faction", faction);
        return query.getResultList();
    }

    public FactionOrder findOrder(UUID id) { return entityManager.find(FactionOrder.class, id); }
    public FactionOrder findLockedOrder(UUID id) { return entityManager.find(FactionOrder.class, id, LockModeType.PESSIMISTIC_WRITE); }
    public <T> T find(Class<T> type, UUID id) { return entityManager.find(type, id); }
    public <T> T findLocked(Class<T> type, UUID id) { return entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE); }
    public void persist(Object entity) { entityManager.persist(entity); }

    public List<FactionOrderLine> lines(FactionOrder order) {
        return entityManager.createQuery("from FactionOrderLine line where line.order = :order", FactionOrderLine.class)
                .setParameter("order", order).getResultList();
    }

    public List<AssemblyItem> assemblyItems(Assembly assembly) {
        return entityManager.createQuery("from AssemblyItem item where item.assembly = :assembly", AssemblyItem.class)
                .setParameter("assembly", assembly).getResultList();
    }

    public AssemblyItem assemblyItem(Assembly assembly, org.ash.inventory.model.Item item) {
        return entityManager.createQuery("from AssemblyItem component where component.assembly = :assembly and component.item = :item", AssemblyItem.class)
                .setParameter("assembly", assembly).setParameter("item", item)
                .getResultStream().findFirst().orElse(null);
    }

    public List<FactionOrderHistory> history(FactionOrder order) {
        return entityManager.createQuery("from FactionOrderHistory history where history.order = :order order by history.occurredAt", FactionOrderHistory.class)
                .setParameter("order", order).getResultList();
    }

    public List<StockReservation> reservations(FactionOrder order) {
        return entityManager.createQuery("from StockReservation reservation where reservation.order = :order", StockReservation.class)
                .setParameter("order", order).getResultList();
    }

    public StockReservation reservation(FactionOrderLine line) {
        return entityManager.createQuery("from StockReservation reservation where reservation.orderLine = :line order by reservation.createdAt desc", StockReservation.class)
                .setParameter("line", line).setMaxResults(1).getResultStream().findFirst().orElse(null);
    }

    public void deleteLines(FactionOrder order) {
        for (var reservation : reservations(order)) entityManager.remove(reservation);
        var assignments = entityManager.createQuery(
                "from OrderLineAssetAssignment assignment where assignment.order = :order",
                org.ash.inventory.model.OrderLineAssetAssignment.class)
                .setParameter("order", order).getResultList();
        for (var assignment : assignments) entityManager.remove(assignment);
        entityManager.flush();
        for (var line : lines(order)) entityManager.remove(line);
    }

    public boolean historyExists(FactionOrder order, UUID idempotencyKey) {
        return entityManager.createQuery("select count(h) from FactionOrderHistory h where h.order = :order and h.idempotencyKey = :key", Long.class)
                .setParameter("order", order).setParameter("key", idempotencyKey).getSingleResult() > 0;
    }

    public FactionOrder orderByHistoryIdempotencyKey(UUID idempotencyKey) {
        return entityManager.createQuery("select h.order from FactionOrderHistory h where h.idempotencyKey = :key", FactionOrder.class)
                .setParameter("key", idempotencyKey).getResultStream().findFirst().orElse(null);
    }

    public long countOrderCodes(String prefixPattern) {
        return entityManager.createQuery("select count(o) from FactionOrder o where o.orderCode like :prefix", Long.class)
                .setParameter("prefix", prefixPattern).getSingleResult();
    }
}
