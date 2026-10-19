package org.ash.inventory.orm;

import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

/** Common entity mechanics for focused domain query collaborators. */
public abstract class EntityOrm {
    @jakarta.inject.Inject protected org.ash.inventory.helper.security.ActorService accessActor;
    @Inject protected EntityManager entityManager;

    public <T> T find(Class<T> type, Object id) { return accessActor.protect(entityManager.find(type, id), false); }
    public <T> T findLocked(Class<T> type, Object id) { return accessActor.protect(entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE), true); }
    public void lock(Object value) { entityManager.lock(value, LockModeType.PESSIMISTIC_WRITE); }
    public void refresh(Object value) { entityManager.refresh(value); }
    public void refreshLocked(Object value) { entityManager.refresh(value, LockModeType.PESSIMISTIC_WRITE); accessActor.protect(value, true); }
    public void persist(Object value) { entityManager.persist(value); }
    public void remove(Object value) { entityManager.remove(value); }
    public void flush() { entityManager.flush(); }

    /** Locked lookup that also reloads state committed by a transaction this one waited for. */
    public <T> T findLockedFresh(Class<T> type, Object id) {
        var value = entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE);
        if (value != null) entityManager.refresh(value, LockModeType.PESSIMISTIC_WRITE);
        return accessActor.protect(value, true);
    }
    public <T> T require(Class<T> type, Object id, String label) { return found(find(type, id), label); }
    public <T> T requireLocked(Class<T> type, Object id, String label) { return found(findLocked(type, id), label); }
    public <T> T requireLockedFresh(Class<T> type, Object id, String label) { return found(findLockedFresh(type, id), label); }
    /** {@code root} and every storage location below it (unscoped ids; visibility is applied by the caller's query). */
    public java.util.Set<java.util.UUID> subtreeIds(java.util.UUID root) {
        var subtree = new java.util.LinkedHashSet<java.util.UUID>();
        java.util.List<java.util.UUID> frontier = java.util.List.of(root);
        while (!frontier.isEmpty()) {
            subtree.addAll(frontier);
            frontier = entityManager.createQuery("select l.id from StorageLocation l where l.parent.id in :parents", java.util.UUID.class)
                    .setParameter("parents", frontier).getResultList().stream().filter(id -> !subtree.contains(id)).toList();
        }
        return subtree;
    }

    public static <T> T found(T value, String label) {
        if (value == null) throw org.ash.inventory.resource.ApiException.notFound(label + " not found");
        return value;
    }
}
