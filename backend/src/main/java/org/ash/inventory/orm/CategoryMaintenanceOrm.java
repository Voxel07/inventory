package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.CategoryMaintenancePolicy;
import org.ash.inventory.model.Item;

import java.util.List;

@ApplicationScoped
public class CategoryMaintenanceOrm {
    private final EntityManager entityManager;

    public CategoryMaintenanceOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public List<CategoryMaintenancePolicy> list() {
        return entityManager.createQuery("select p from CategoryMaintenancePolicy p order by p.category", CategoryMaintenancePolicy.class)
                .getResultList();
    }

    public CategoryMaintenancePolicy find(String category) {
        return entityManager.createQuery("select p from CategoryMaintenancePolicy p where lower(p.category) = lower(:name)", CategoryMaintenancePolicy.class)
                .setParameter("name", category).getResultStream().findFirst().orElse(null);
    }

    public List<Item> items(String category) {
        return entityManager.createQuery("select i from Item i where i.accessPolicy is null and lower(i.category) = lower(:name)", Item.class)
                .setParameter("name", category).getResultList();
    }

    public void persist(CategoryMaintenancePolicy policy) { entityManager.persist(policy); }
    public void remove(CategoryMaintenancePolicy policy) { entityManager.remove(policy); }
}
