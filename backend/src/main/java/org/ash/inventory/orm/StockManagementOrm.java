package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.InventoryLot;
import org.ash.inventory.model.InventoryPosition;
import org.ash.inventory.model.Warehouse;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.model.AssetInstance;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@ApplicationScoped
public class StockManagementOrm extends EntityOrm {



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

    public List<InventoryLot> lots(UUID itemId, int offset, int limit, UserAccount actor) {
        var query = entityManager.createQuery("from InventoryLot lot join fetch lot.item where " + visibility("lot.item")
                + (itemId == null ? "" : " and lot.item.id = :itemId") + " order by lot.expiryDate nulls last, lot.lotNumber", InventoryLot.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        return visible(query, actor).setFirstResult(offset).setMaxResults(limit).getResultList();
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

    public List<InventoryPosition> positions(UUID itemId, UUID locationId, int offset, int limit, UserAccount actor) {
        var jpql = new StringBuilder("select position from InventoryPosition position join fetch position.item join fetch position.location left join fetch position.lot where ").append(visibility("position.item")).append(" and ").append(InventoryAccessOrm.visible("position.location.accessPolicy"));
        if (itemId != null) jpql.append(" and position.item.id = :itemId");
        if (locationId != null) jpql.append(" and position.location.id = :locationId");
        jpql.append(" order by position.item.name, position.location.name");
        var query = entityManager.createQuery(jpql.toString(), InventoryPosition.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        if (locationId != null) query.setParameter("locationId", locationId);
        return visible(query, actor).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public List<AssetInstance> assets(UUID itemId, UUID locationId, int offset, int limit, UserAccount actor) {
        var query = entityManager.createQuery("from AssetInstance a join fetch a.item left join fetch a.currentLocation left join fetch a.currentCustodian where a.active = true and " + visibility("a.item")
                + (itemId == null ? "" : " and a.item.id = :itemId") + (locationId == null ? "" : " and a.currentLocation.id = :locationId") + " order by a.assetCode, a.id", AssetInstance.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        if (locationId != null) query.setParameter("locationId", locationId);
        return visible(query, actor).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    private String visibility(String item) {
        return InventoryAccessOrm.visible(item + ".accessPolicy");
    }
    private <T> jakarta.persistence.TypedQuery<T> visible(jakarta.persistence.TypedQuery<T> query, UserAccount actor) {
        return InventoryAccessOrm.bind(query, actor);
    }
}
