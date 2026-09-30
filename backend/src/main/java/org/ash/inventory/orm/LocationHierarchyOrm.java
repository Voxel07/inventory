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

    public Long activeChildren(StorageLocation parent) {
        return entityManager.createQuery("select count(l) from StorageLocation l where l.parent = :parent and l.active = true", Long.class).setParameter("parent", parent).getSingleResult();
    }

    public Long activeLocations(Warehouse warehouse) {
        return entityManager.createQuery("select count(l) from StorageLocation l where l.warehouse = :warehouse and l.active = true", Long.class)
                .setParameter("warehouse", warehouse).getSingleResult();
    }
}
