package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItem;
import org.ash.inventory.model.InventoryOrder;
import org.ash.inventory.model.OrderHistory;
import org.ash.inventory.model.OrderLine;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.OrderLineAssetAssignment;
import org.ash.inventory.model.StockReservation;

import java.util.List;
import java.util.Collection;
import java.util.Locale;
import java.util.UUID;

/** Persistence for both order kinds and their shared lifecycle records. */
@ApplicationScoped
public class OrderOrm extends EntityOrm {
    @jakarta.inject.Inject InventoryAccessOrm privacyScopes;


    /** {@code factionKeys} ({@code EVENT:slug}) restricts the result to those factions; {@code null} means unrestricted. */
    public List<InventoryOrder> orders(String eventType, String faction, String orderCode, Collection<String> factionKeys,
            Collection<org.ash.inventory.model.DomainEnums.OrderStatus> statuses, UUID eventId, int offset, int limit) {
        if (factionKeys != null && factionKeys.isEmpty()) return List.of();
        var denied = privacyScopes.deniedReferences(accessActor.current());
        var jpql = new StringBuilder("select o from InventoryOrder o "
                + "join fetch o.eventOccurrence join fetch o.faction left join fetch o.pickupLocation where o.kind = faction");
        if (eventType != null && !eventType.isBlank()) jpql.append(" and o.eventOccurrence.eventType = :eventType");
        if (faction != null && !faction.isBlank()) jpql.append(" and o.faction.name = :faction");
        if (orderCode != null && !orderCode.isBlank()) jpql.append(" and o.orderCode = :orderCode");
        if (factionKeys != null) jpql.append(" and concat(upper(o.faction.eventType), concat(':', lower(o.faction.slug))) in :factionKeys");
        if (!statuses.isEmpty()) jpql.append(" and o.status in :statuses");
        if (eventId != null) jpql.append(" and o.eventOccurrence.id = :eventId");
        jpql.append(InventoryAccessOrm.excluding("o", denied)).append(" order by o.eventOccurrence.startDate desc");
        var query = entityManager.createQuery(jpql.toString(), InventoryOrder.class);
        if (eventType != null && !eventType.isBlank()) query.setParameter("eventType", eventType);
        if (faction != null && !faction.isBlank()) query.setParameter("faction", faction);
        if (orderCode != null && !orderCode.isBlank()) query.setParameter("orderCode", orderCode.trim().toUpperCase(Locale.ROOT));
        if (factionKeys != null) query.setParameter("factionKeys", factionKeys);
        if (!statuses.isEmpty()) query.setParameter("statuses", statuses);
        if (eventId != null) query.setParameter("eventId", eventId);
        return InventoryAccessOrm.bindDenied(query, denied).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public InventoryOrder findOrder(UUID id) { return entityManager.find(InventoryOrder.class, id); }
    public InventoryOrder findLockedOrder(UUID id) { return entityManager.find(InventoryOrder.class, id, LockModeType.PESSIMISTIC_WRITE); }

    public record Filter(Collection<org.ash.inventory.model.DomainEnums.OrderStatus> statuses, UUID eventId, String eventType, String search) {}

    public List<InventoryOrder> orders(org.ash.inventory.model.UserAccount actor, Filter filter, int offset, int limit) {
        var denied = privacyScopes.deniedReferences(actor);
        var jpql = new StringBuilder("from InventoryOrder o join fetch o.createdBy left join fetch o.eventOccurrence event where o.kind = general");
        if (!filter.statuses().isEmpty()) jpql.append(" and o.status in :statuses");
        if (filter.eventId() != null) jpql.append(" and event.id = :eventId");
        else if (filter.eventType() != null && !filter.eventType().isBlank()) jpql.append(" and (event is null or event.eventType = :eventType)");
        boolean searching = filter.search() != null && !filter.search().isBlank();
        if (searching) jpql.append(" and (lower(o.name) like :search or lower(o.purpose) like :search)");
        var query = entityManager.createQuery(jpql + InventoryAccessOrm.excluding("o", denied) + " order by o.createdAt desc, o.id", InventoryOrder.class);
        if (!filter.statuses().isEmpty()) query.setParameter("statuses", filter.statuses());
        if (filter.eventId() != null) query.setParameter("eventId", filter.eventId());
        else if (filter.eventType() != null && !filter.eventType().isBlank()) query.setParameter("eventType", filter.eventType());
        if (searching) query.setParameter("search", "%" + filter.search().trim().toLowerCase(Locale.ROOT) + "%");
        return InventoryAccessOrm.bindDenied(query, denied).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<OrderLine> lines(InventoryOrder order) {
        return entityManager.createQuery("from OrderLine line where line.order = :order order by line.lineNumber, line.createdAt, line.id", OrderLine.class)
                .setParameter("order", order).getResultList();
    }

    public List<OrderLine> lines(Collection<InventoryOrder> orders) {
        if (orders.isEmpty()) return List.of();
        return entityManager.createQuery(
                "select line from OrderLine line "
                        + "join fetch line.item i left join fetch i.storageLocation sl left join fetch sl.warehouse left join fetch sl.parent left join fetch i.returnLocation rl left join fetch rl.warehouse left join fetch rl.parent left join fetch line.sourceAssembly "
                        + "where line.order in :orders",
                OrderLine.class)
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

    public List<OrderHistory> history(InventoryOrder order) {
        return entityManager.createQuery("from OrderHistory history join fetch history.actor where history.order = :order order by history.occurredAt, history.id", OrderHistory.class)
                .setParameter("order", order).getResultList();
    }

    public List<StockReservation> reservations(InventoryOrder order) {
        return entityManager.createQuery("from StockReservation reservation where reservation.order = :order", StockReservation.class)
                .setParameter("order", order).getResultList();
    }

    public StockReservation reservation(OrderLine line) {
        return entityManager.createQuery("from StockReservation reservation where reservation.orderLine = :line order by reservation.createdAt desc", StockReservation.class)
                .setParameter("line", line).setMaxResults(1).getResultStream().findFirst().orElse(null);
    }

    public List<OrderLineAssetAssignment> assetAssignments(InventoryOrder order) {
        return entityManager.createQuery(
                "select assignment from OrderLineAssetAssignment assignment "
                        + "join fetch assignment.assetInstance asset "
                        + "join fetch asset.item left join fetch asset.currentLocation left join fetch asset.currentCustodian "
                        + "where assignment.order = :order order by asset.assetCode",
                OrderLineAssetAssignment.class)
                .setParameter("order", order).getResultList();
    }

    public List<OrderLineAssetAssignment> assetAssignments(InventoryOrder order, Item item) {
        return entityManager.createQuery(
                "select assignment from OrderLineAssetAssignment assignment "
                        + "join fetch assignment.assetInstance asset "
                        + "where assignment.order = :order and asset.item = :item order by asset.assetCode",
                OrderLineAssetAssignment.class)
                .setParameter("order", order).setParameter("item", item).getResultList();
    }

    public void removeAssetAssignments(InventoryOrder order) {
        for (var line : order.lines) line.assets.clear();
        entityManager.flush();
    }

    public void deleteLines(InventoryOrder order) {
        for (var reservation : reservations(order)) entityManager.remove(reservation);
        removeAssetAssignments(order);
        order.lines.clear();
    }

    public InventoryOrder orderByHistoryIdempotencyKey(UUID idempotencyKey) {
        return entityManager.createQuery("select h.order from OrderHistory h where h.idempotencyKey = :key", InventoryOrder.class)
                .setParameter("key", idempotencyKey).getResultStream().findFirst().orElse(null);
    }

    public long countOrderCodes(String prefixPattern) {
        return entityManager.createQuery("select count(o) from InventoryOrder o where o.orderCode like :prefix", Long.class)
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
