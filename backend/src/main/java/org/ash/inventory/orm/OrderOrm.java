package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItem;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderHistory;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.OrderLineAssetAssignment;
import org.ash.inventory.model.StockReservation;

import java.util.List;
import java.util.Collection;
import java.util.UUID;

/** Database access for faction orders and their related models. */
@ApplicationScoped
public class OrderOrm {
    private final EntityManager entityManager;

    public OrderOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public List<FactionOrder> orders(String eventType, String faction, Collection<String> factionNames,
            Collection<String> factionKeys, int offset, int limit) {
        if (factionNames != null && factionNames.isEmpty() && factionKeys != null && factionKeys.isEmpty()) {
            return List.of();
        }
        var jpql = new StringBuilder("select o from FactionOrder o "
                + "join fetch o.eventOccurrence join fetch o.faction left join fetch o.pickupLocation where 1 = 1");
        if (eventType != null && !eventType.isBlank()) jpql.append(" and o.eventOccurrence.eventType = :eventType");
        if (faction != null && !faction.isBlank()) jpql.append(" and o.faction.name = :faction");
        if (factionNames != null || factionKeys != null) {
            jpql.append(" and (");
            if (factionNames != null && !factionNames.isEmpty()) jpql.append("o.faction.name in :factionNames");
            if (factionNames != null && !factionNames.isEmpty() && factionKeys != null && !factionKeys.isEmpty()) {
                jpql.append(" or ");
            }
            if (factionKeys != null && !factionKeys.isEmpty()) {
                jpql.append("concat(o.eventOccurrence.eventType, concat(':', o.faction.name)) in :factionKeys");
            }
            jpql.append(')');
        }
        jpql.append(" order by o.eventOccurrence.startDate desc");
        var query = entityManager.createQuery(jpql.toString(), FactionOrder.class);
        if (eventType != null && !eventType.isBlank()) query.setParameter("eventType", eventType);
        if (faction != null && !faction.isBlank()) query.setParameter("faction", faction);
        if (factionNames != null && !factionNames.isEmpty()) query.setParameter("factionNames", factionNames);
        if (factionKeys != null && !factionKeys.isEmpty()) query.setParameter("factionKeys", factionKeys);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
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

    public List<FactionOrderLine> lines(Collection<FactionOrder> orders) {
        if (orders.isEmpty()) return List.of();
        return entityManager.createQuery(
                "select line from FactionOrderLine line "
                        + "join fetch line.item left join fetch line.sourceAssembly "
                        + "where line.order in :orders",
                FactionOrderLine.class)
                .setParameter("orders", orders).getResultList();
    }

    public List<AssemblyItem> assemblyItems(Collection<UUID> assemblyIds) {
        if (assemblyIds.isEmpty()) return List.of();
        return entityManager.createQuery(
                "select component from AssemblyItem component where component.assembly.id in :assemblyIds",
                AssemblyItem.class)
                .setParameter("assemblyIds", assemblyIds).getResultList();
    }

    public List<AssemblyItem> assemblyItems(Assembly assembly) {
        return entityManager.createQuery("from AssemblyItem item where item.assembly = :assembly", AssemblyItem.class)
                .setParameter("assembly", assembly).getResultList();
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

    public List<OrderLineAssetAssignment> assetAssignments(FactionOrder order) {
        return entityManager.createQuery(
                "select assignment from OrderLineAssetAssignment assignment "
                        + "join fetch assignment.assetInstance asset "
                        + "join fetch asset.item "
                        + "where assignment.order = :order order by asset.assetCode",
                OrderLineAssetAssignment.class)
                .setParameter("order", order).getResultList();
    }

    public List<OrderLineAssetAssignment> assetAssignments(FactionOrder order, Item item) {
        return entityManager.createQuery(
                "select assignment from OrderLineAssetAssignment assignment "
                        + "join fetch assignment.assetInstance asset "
                        + "where assignment.order = :order and asset.item = :item order by asset.assetCode",
                OrderLineAssetAssignment.class)
                .setParameter("order", order).setParameter("item", item).getResultList();
    }

    public void removeAssetAssignments(FactionOrder order) {
        for (var assignment : assetAssignments(order)) entityManager.remove(assignment);
        entityManager.flush();
    }

    public void deleteLines(FactionOrder order) {
        for (var reservation : reservations(order)) entityManager.remove(reservation);
        removeAssetAssignments(order);
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

    /**
     * Serializes code allocation for orders in the same faction. The lock lives
     * in PostgreSQL, so it also protects creation across application replicas.
     */
    public void lockOrderCodeScope(Faction faction) {
        entityManager.flush();
        entityManager.lock(faction, LockModeType.PESSIMISTIC_WRITE);
    }
}
