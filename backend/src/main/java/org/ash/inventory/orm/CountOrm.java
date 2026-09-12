package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.*;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@ApplicationScoped
public class CountOrm {
    private final EntityManager entityManager;

    public CountOrm(EntityManager entityManager) { this.entityManager = entityManager; }
    public void persist(Object value) { entityManager.persist(value); }
    public <T> T find(Class<T> type, UUID id) { return entityManager.find(type, id); }
    public <T> T locked(Class<T> type, UUID id) { return entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE); }

    public List<InventoryCountSession> sessions(String status, int offset, int limit) {
        var jpql = status == null || status.isBlank()
                ? "select session from InventoryCountSession session left join fetch session.warehouse left join fetch session.location left join fetch session.item join fetch session.createdBy left join fetch session.approvedBy order by session.createdAt desc"
                : "select session from InventoryCountSession session left join fetch session.warehouse left join fetch session.location left join fetch session.item join fetch session.createdBy left join fetch session.approvedBy where session.status = :status order by session.createdAt desc";
        var query = entityManager.createQuery(jpql, InventoryCountSession.class);
        if (status != null && !status.isBlank()) query.setParameter("status", DomainEnums.CountStatus.valueOf(status));
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public List<InventoryCountLine> lines(Collection<InventoryCountSession> sessions) {
        if (sessions.isEmpty()) return List.of();
        return entityManager.createQuery("select line from InventoryCountLine line join fetch line.item join fetch line.location left join fetch line.assetInstance left join fetch line.lot left join fetch line.countedBy where line.session in :sessions order by line.item.name, line.createdAt", InventoryCountLine.class)
                .setParameter("sessions", sessions).getResultList();
    }
    public List<InventoryCountLine> lockedLines(InventoryCountSession session) {
        return entityManager.createQuery("select line from InventoryCountLine line join fetch line.item join fetch line.location left join fetch line.assetInstance left join fetch line.lot left join fetch line.countedBy where line.session = :session order by line.item.name, line.createdAt", InventoryCountLine.class)
                .setParameter("session", session).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
    public List<InventoryPosition> scopedPositions(Warehouse warehouse, StorageLocation location, Item item, String category) {
        var jpql = new StringBuilder("select position from InventoryPosition position join fetch position.item join fetch position.location left join fetch position.lot where 1=1");
        if (warehouse != null) jpql.append(" and position.location.warehouse = :warehouse");
        if (location != null) jpql.append(" and position.location = :location");
        if (item != null) jpql.append(" and position.item = :item");
        if (category != null && !category.isBlank()) jpql.append(" and lower(position.item.category) = :category");
        var query = entityManager.createQuery(jpql.toString(), InventoryPosition.class);
        if (warehouse != null) query.setParameter("warehouse", warehouse);
        if (location != null) query.setParameter("location", location);
        if (item != null) query.setParameter("item", item);
        if (category != null && !category.isBlank()) query.setParameter("category", category.trim().toLowerCase(Locale.ROOT));
        return query.getResultList();
    }
    public List<AssetInstance> scopedAssets(Warehouse warehouse, StorageLocation location, Item item, String category) {
        var jpql = new StringBuilder("select asset from AssetInstance asset join fetch asset.item join fetch asset.currentLocation where asset.active = true");
        if (warehouse != null) jpql.append(" and asset.currentLocation.warehouse = :warehouse");
        if (location != null) jpql.append(" and asset.currentLocation = :location");
        if (item != null) jpql.append(" and asset.item = :item");
        if (category != null && !category.isBlank()) jpql.append(" and lower(asset.item.category) = :category");
        var query = entityManager.createQuery(jpql.toString(), AssetInstance.class);
        if (warehouse != null) query.setParameter("warehouse", warehouse);
        if (location != null) query.setParameter("location", location);
        if (item != null) query.setParameter("item", item);
        if (category != null && !category.isBlank()) query.setParameter("category", category.trim().toLowerCase(Locale.ROOT));
        return query.getResultList();
    }
    public InventoryPosition lockedPosition(Item item, StorageLocation location, InventoryLot lot) {
        var jpql = lot == null
                ? "from InventoryPosition position where position.item = :item and position.location = :location and position.lot is null"
                : "from InventoryPosition position where position.item = :item and position.location = :location and position.lot = :lot";
        var query = entityManager.createQuery(jpql, InventoryPosition.class).setParameter("item", item)
                .setParameter("location", location);
        if (lot != null) query.setParameter("lot", lot);
        return query.setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultStream().findFirst().orElse(null);
    }
    public boolean numberExists(String number) {
        return entityManager.createQuery("select count(session) from InventoryCountSession session where lower(session.sessionNumber) = :number", Long.class)
                .setParameter("number", number.toLowerCase(Locale.ROOT)).getSingleResult() > 0;
    }
}
