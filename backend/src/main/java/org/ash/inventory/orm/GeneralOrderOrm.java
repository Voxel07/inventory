package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.GeneralOrder;

import java.util.List;

@ApplicationScoped
public class GeneralOrderOrm {
    private final EntityManager entityManager;

    public GeneralOrderOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public List<GeneralOrder> orders(int offset, int limit) {
        return entityManager.createQuery("from GeneralOrder orderEntry order by orderEntry.createdAt desc", GeneralOrder.class)
                .setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public void persist(GeneralOrder order) { entityManager.persist(order); }
}
