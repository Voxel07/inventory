package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.GeneralOrder;
import org.ash.inventory.model.GeneralOrderHistory;

import java.util.List;
import java.util.UUID;
import jakarta.persistence.LockModeType;

@ApplicationScoped
public class GeneralOrderOrm {
    @jakarta.inject.Inject InventoryAccessOrm privacyScopes;
    @jakarta.inject.Inject protected org.ash.inventory.helper.security.ActorService accessActor;
    private final EntityManager entityManager;

    public GeneralOrderOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public List<GeneralOrder> orders(int offset, int limit) {
        var denied = privacyScopes.deniedReferences(accessActor.current());
        return InventoryAccessOrm.bindDenied(entityManager.createQuery("from GeneralOrder orderEntry where 1=1" + InventoryAccessOrm.excluding("orderEntry", denied) + " order by orderEntry.createdAt desc", GeneralOrder.class), denied)
                .setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<GeneralOrder> orders(org.ash.inventory.model.UserAccount actor, int offset, int limit) {
        var denied = privacyScopes.deniedReferences(actor);
        boolean scoped = actor.role == org.ash.inventory.model.DomainEnums.UserRole.faction_leader;
        var query = entityManager.createQuery("from GeneralOrder o join fetch o.createdBy left join fetch o.eventOccurrence" + (scoped ? " where o.createdBy = :actor" : " where 1=1") + InventoryAccessOrm.excluding("o", denied) + " order by o.createdAt desc", GeneralOrder.class);
        if (scoped) query.setParameter("actor", actor);
        return InventoryAccessOrm.bindDenied(query, denied).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public GeneralOrderHistory commandHistory(UUID key) {
        return entityManager.createQuery("from GeneralOrderHistory h where h.commandId = :key", GeneralOrderHistory.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }

    public List<GeneralOrderHistory> history(GeneralOrder order) {
        return entityManager.createQuery("from GeneralOrderHistory h join fetch h.actor where h.order = :order order by h.occurredAt, h.id", GeneralOrderHistory.class)
                .setParameter("order", order).getResultList();
    }

    public <T> T find(Class<T> type, UUID id) { return accessActor.protect(entityManager.find(type, id), false); }
    public <T> T findLocked(Class<T> type, UUID id) { return accessActor.protect(entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE), true); }
    public void flush() { entityManager.flush(); }
    public void persist(Object value) { entityManager.persist(value); }
    public GeneralOrder locked(UUID id) { return entityManager.find(GeneralOrder.class, id, LockModeType.PESSIMISTIC_WRITE); }
}
