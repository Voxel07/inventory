package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.GeneralOrder;

import java.util.List;
import java.util.UUID;
import jakarta.persistence.LockModeType;

@ApplicationScoped
public class GeneralOrderOrm {
    private final EntityManager entityManager;

    public GeneralOrderOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public List<GeneralOrder> orders(int offset, int limit) {
        return entityManager.createQuery("from GeneralOrder orderEntry order by orderEntry.createdAt desc", GeneralOrder.class)
                .setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<GeneralOrder> orders(org.ash.inventory.model.UserAccount actor, int offset, int limit) {
        boolean scoped = actor.role == org.ash.inventory.model.DomainEnums.UserRole.faction_leader;
        var query = entityManager.createQuery("from GeneralOrder o" + (scoped ? " where o.createdBy = :actor" : "") + " order by o.createdAt desc", GeneralOrder.class);
        if (scoped) query.setParameter("actor", actor);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public void persist(GeneralOrder order) { entityManager.persist(order); }
    public GeneralOrder locked(UUID id) { return entityManager.find(GeneralOrder.class, id, LockModeType.PESSIMISTIC_WRITE); }
}
