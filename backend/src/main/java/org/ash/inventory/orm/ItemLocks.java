package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.Item;

import java.util.Collection;
import java.util.UUID;

/**
 * Multi-item stock commands lock all their items up front in one canonical (database UUID) order, before any
 * dependent asset, position or reservation lock, so two commands over the same items cannot deadlock.
 */
@ApplicationScoped
public class ItemLocks {
    private final EntityManager entityManager;

    public ItemLocks(EntityManager entityManager) { this.entityManager = entityManager; }

    public void lock(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return;
        entityManager.createQuery("select i from Item i where i.id in :ids order by i.id", Item.class)
                .setParameter("ids", itemIds).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
}
