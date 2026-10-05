package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.InventoryMediaObject;

@ApplicationScoped
public class InventoryMediaOrm extends EntityOrm {
    public InventoryMediaObject byKey(String key) {
        return entityManager.createQuery("from InventoryMediaObject m where m.objectKey = :key", InventoryMediaObject.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }

    public long stagedCount(org.ash.inventory.model.UserAccount uploader) {
        return entityManager.createQuery("select count(m) from InventoryMediaObject m where m.resourceType is null and m.uploader = :uploader", Long.class)
                .setParameter("uploader", uploader).getSingleResult();
    }

    public java.util.List<String> stagedKeysBefore(java.time.Instant cutoff, int limit) {
        return entityManager.createQuery("select m.objectKey from InventoryMediaObject m where m.resourceType is null and m.createdAt < :cutoff order by m.createdAt", String.class)
                .setParameter("cutoff", cutoff).setMaxResults(limit).getResultList();
    }

    public int deleteStagedRecord(String key) {
        return entityManager.createQuery("delete from InventoryMediaObject m where m.objectKey = :key and m.resourceType is null")
                .setParameter("key", key).executeUpdate();
    }
}
