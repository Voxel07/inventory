package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import java.util.*;

@ApplicationScoped
public class LocationHierarchyService {
    @Inject EntityManager em;
    public void lockHierarchy() {
        em.createQuery("from Warehouse order by id", Warehouse.class).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        em.createQuery("from StorageLocation order by id", StorageLocation.class).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
    public void apply(StorageLocation target, ApiModels.StorageLocationInput input) {
        var warehouse = input.warehouseId() == null ? null : em.find(Warehouse.class, input.warehouseId());
        if (input.warehouseId() != null && warehouse == null) throw ApiException.badRequest("Warehouse not found");
        var parent = input.parentLocationId() == null ? null : em.find(StorageLocation.class, input.parentLocationId());
        if (input.parentLocationId() != null && parent == null) throw ApiException.badRequest("Parent location not found");
        var visited = new HashSet<UUID>();
        for (var cursor = parent; cursor != null; cursor = cursor.parent) {
            if (Objects.equals(cursor.id, target.id) || !visited.add(cursor.id)) throw ApiException.conflict("A location cannot be its own ancestor");
        }
        boolean active = input.active() == null ? target.active : input.active();
        if (parent != null && !Objects.equals(id(parent.warehouse), id(warehouse))) throw ApiException.conflict("Parent and child must belong to the same warehouse");
        if (active && ((warehouse != null && !warehouse.active) || (parent != null && !parent.active))) throw ApiException.conflict("Activate the warehouse and parent first");
        if (target.id != null) for (var child : em.createQuery("from StorageLocation where parent = :parent", StorageLocation.class).setParameter("parent", target).getResultList()) {
            if (!Objects.equals(id(child.warehouse), id(warehouse))) throw ApiException.conflict("Move child locations before changing warehouse");
            if (!active && child.active) throw ApiException.conflict("Deactivate child locations first");
        }
        target.parent = parent; target.warehouse = warehouse; target.active = active;
    }
    public void deactivate(StorageLocation location) {
        if (em.createQuery("select count(l) from StorageLocation l where l.parent = :parent and l.active = true", Long.class).setParameter("parent", location).getSingleResult() > 0) throw ApiException.conflict("Deactivate child locations first");
        location.active = false;
    }
    private UUID id(Warehouse value) { return value == null ? null : value.id; }

    public void validateWarehouseState(Warehouse warehouse, boolean active) {
        if (!active && warehouse.id != null && em.createQuery("select count(l) from StorageLocation l where l.warehouse = :warehouse and l.active = true", Long.class)
                .setParameter("warehouse", warehouse).getSingleResult() > 0) throw ApiException.conflict("Deactivate warehouse locations first");
    }
}
