package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.*;
import java.util.List;

/** Persistence queries for the LocationHierarchy use cases. Business rules remain in the service. */
@ApplicationScoped
public class LocationHierarchyOrm extends EntityOrm {
    public List<Warehouse> lockWarehouses() {
        return entityManager.createQuery("from Warehouse order by id", Warehouse.class).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }

    public List<StorageLocation> lockLocations() {
        return entityManager.createQuery("from StorageLocation order by id", StorageLocation.class).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }

    public List<StorageLocation> children(StorageLocation parent) {
        return entityManager.createQuery("from StorageLocation where parent = :parent", StorageLocation.class).setParameter("parent", parent).getResultList();
    }

    /**
     * Locations on the same level as {@code target}: same parent, or for top-level locations the same warehouse.
     * Top-level locations outside warehouses are compared within the same owner (or among public ones) only.
     */
    public List<StorageLocation> siblings(StorageLocation target) {
        String scope = target.parent != null ? "l.parent = :parent"
                : target.warehouse != null ? "l.parent is null and l.warehouse = :warehouse"
                : target.accessPolicy == null ? "l.parent is null and l.warehouse is null and l.accessPolicy is null"
                : "l.parent is null and l.warehouse is null and l.accessPolicy.owner = :owner";
        var query = entityManager.createQuery("from StorageLocation l where " + scope + (target.id == null ? "" : " and l.id <> :id"), StorageLocation.class);
        if (target.parent != null) query.setParameter("parent", target.parent);
        else if (target.warehouse != null) query.setParameter("warehouse", target.warehouse);
        else if (target.accessPolicy != null) query.setParameter("owner", target.accessPolicy.owner);
        if (target.id != null) query.setParameter("id", target.id);
        return query.getResultList();
    }

    public List<StorageLocation> roots(Warehouse warehouse) {
        return entityManager.createQuery("from StorageLocation where parent is null and warehouse = :warehouse", StorageLocation.class)
                .setParameter("warehouse", warehouse).getResultList();
    }

    /** Items whose home location is one of {@code locations}; unscoped, for maintaining access links. */
    public List<Item> itemsStoredIn(java.util.Collection<java.util.UUID> locations) {
        if (locations.isEmpty()) return List.of();
        return entityManager.createQuery("from Item i where i.storageLocation.id in :locations and i.accessPolicy is not null", Item.class)
                .setParameter("locations", locations).getResultList();
    }

    public Long activeChildren(StorageLocation parent) {
        return entityManager.createQuery("select count(l) from StorageLocation l where l.parent = :parent and l.active = true", Long.class).setParameter("parent", parent).getSingleResult();
    }

    public Long activeLocations(Warehouse warehouse) {
        return entityManager.createQuery("select count(l) from StorageLocation l where l.warehouse = :warehouse and l.active = true", Long.class)
                .setParameter("warehouse", warehouse).getSingleResult();
    }
}
