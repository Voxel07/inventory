package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.InventoryMediaObject;

@ApplicationScoped
public class InventoryMediaOrm extends EntityOrm {
    public InventoryMediaObject byKey(String key) {
        return entityManager.createQuery("from InventoryMediaObject m where m.objectKey = :key", InventoryMediaObject.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }
}
