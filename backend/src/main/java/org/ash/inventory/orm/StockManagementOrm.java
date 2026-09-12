package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.InventoryCode;
import org.ash.inventory.model.InventoryLot;
import org.ash.inventory.model.InventoryPosition;
import org.ash.inventory.model.Warehouse;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@ApplicationScoped
public class StockManagementOrm {
    private final EntityManager entityManager;

    public StockManagementOrm(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public void persist(Object entity) { entityManager.persist(entity); }
    public <T> T find(Class<T> type, UUID id) { return entityManager.find(type, id); }
    public <T> T findLocked(Class<T> type, UUID id) { return entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE); }

    public List<Warehouse> warehouses(int offset, int limit) {
        return entityManager.createQuery("from Warehouse warehouse order by warehouse.active desc, warehouse.name", Warehouse.class)
                .setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public boolean warehouseCodeExists(String code, UUID excluding) {
        var jpql = excluding == null
                ? "select count(warehouse) from Warehouse warehouse where lower(warehouse.code) = :code"
                : "select count(warehouse) from Warehouse warehouse where lower(warehouse.code) = :code and warehouse.id <> :excluding";
        var query = entityManager.createQuery(jpql, Long.class)
                .setParameter("code", code.trim().toLowerCase(Locale.ROOT));
        if (excluding != null) query.setParameter("excluding", excluding);
        return query.getSingleResult() > 0;
    }

    public List<InventoryCode> codes(UUID targetId, int offset, int limit) {
        var query = new StringBuilder("from InventoryCode code");
        if (targetId != null) query.append(" where code.targetId = :targetId");
        query.append(" order by code.active desc, code.code");
        var typed = entityManager.createQuery(query.toString(), InventoryCode.class);
        if (targetId != null) typed.setParameter("targetId", targetId);
        return typed.setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public InventoryCode activeCode(String value) {
        return entityManager.createQuery("from InventoryCode code where lower(code.code) = :code and code.active = true", InventoryCode.class)
                .setParameter("code", value.trim().toLowerCase(Locale.ROOT)).getResultStream().findFirst().orElse(null);
    }

    public boolean codeExists(String value, UUID excluding) {
        var jpql = excluding == null
                ? "select count(code) from InventoryCode code where lower(code.code) = :code"
                : "select count(code) from InventoryCode code where lower(code.code) = :code and code.id <> :excluding";
        var query = entityManager.createQuery(jpql, Long.class)
                .setParameter("code", value.trim().toLowerCase(Locale.ROOT));
        if (excluding != null) query.setParameter("excluding", excluding);
        return query.getSingleResult() > 0;
    }

    public void clearPrimaryCode(DomainEnums.CodeTargetType type, UUID targetId, UUID excluding) {
        var jpql = excluding == null
                ? "update InventoryCode code set code.primaryCode = false where code.targetType = :type and code.targetId = :targetId"
                : "update InventoryCode code set code.primaryCode = false where code.targetType = :type and code.targetId = :targetId and code.id <> :excluding";
        var query = entityManager.createQuery(jpql).setParameter("type", type).setParameter("targetId", targetId);
        if (excluding != null) query.setParameter("excluding", excluding);
        query.executeUpdate();
    }

    public List<InventoryLot> lots(UUID itemId, int offset, int limit) {
        var jpql = itemId == null
                ? "from InventoryLot lot join fetch lot.item order by lot.expiryDate nulls last, lot.lotNumber"
                : "from InventoryLot lot join fetch lot.item where lot.item.id = :itemId order by lot.expiryDate nulls last, lot.lotNumber";
        var query = entityManager.createQuery(jpql, InventoryLot.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public boolean lotNumberExists(UUID itemId, String lotNumber, UUID excluding) {
        var jpql = excluding == null
                ? "select count(lot) from InventoryLot lot where lot.item.id = :itemId and lower(lot.lotNumber) = :lotNumber"
                : "select count(lot) from InventoryLot lot where lot.item.id = :itemId and lower(lot.lotNumber) = :lotNumber and lot.id <> :excluding";
        var query = entityManager.createQuery(jpql, Long.class)
                .setParameter("itemId", itemId)
                .setParameter("lotNumber", lotNumber.trim().toLowerCase(Locale.ROOT));
        if (excluding != null) query.setParameter("excluding", excluding);
        return query.getSingleResult() > 0;
    }

    public List<InventoryPosition> positions(UUID itemId, UUID locationId, int offset, int limit) {
        var jpql = new StringBuilder("select position from InventoryPosition position join fetch position.item join fetch position.location left join fetch position.lot where 1=1");
        if (itemId != null) jpql.append(" and position.item.id = :itemId");
        if (locationId != null) jpql.append(" and position.location.id = :locationId");
        jpql.append(" order by position.item.name, position.location.name");
        var query = entityManager.createQuery(jpql.toString(), InventoryPosition.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        if (locationId != null) query.setParameter("locationId", locationId);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }
}
