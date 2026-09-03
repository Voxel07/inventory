package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.GeneralOrder;

import java.util.List;

@ApplicationScoped
public class GeneralOrderOrm {
    @Inject EntityManager entityManager;

    public List<GeneralOrder> orders() {
        return entityManager.createQuery("from GeneralOrder orderEntry order by orderEntry.createdAt desc", GeneralOrder.class)
                .getResultList();
    }

    public void persist(GeneralOrder order) { entityManager.persist(order); }
}
