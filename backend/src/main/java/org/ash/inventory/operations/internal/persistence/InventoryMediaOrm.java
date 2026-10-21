package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.InventoryMediaObject;
import org.ash.inventory.operations.internal.model.UserAccount;

import jakarta.enterprise.context.ApplicationScoped;
@ApplicationScoped
public class InventoryMediaOrm extends EntityOrm {
    public InventoryMediaObject byKey(String key) {
        return entityManager.createQuery("from InventoryMediaObject m where m.objectKey = :key", InventoryMediaObject.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }

    public long stagedCount(org.ash.inventory.operations.internal.model.UserAccount uploader) {
        return entityManager.createQuery("select count(m) from InventoryMediaObject m where m.resourceType is null and m.uploader = :uploader", Long.class)
                .setParameter("uploader", uploader).getSingleResult();
    }

    public java.util.List<InventoryMediaObject> claimStaged(java.time.Instant cutoff,int limit) {
        return entityManager.createQuery("from InventoryMediaObject m where m.resourceType is null and m.createdAt<:cutoff and (m.purgeLeaseUntil is null or m.purgeLeaseUntil<:now) order by m.createdAt,m.id",InventoryMediaObject.class)
                .setParameter("cutoff",cutoff).setParameter("now",java.time.Instant.now()).setMaxResults(limit)
                .setLockMode(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE).setHint("jakarta.persistence.lock.timeout",-2).getResultList();
    }
    public void deleteClaimed(String key,java.util.UUID lease){entityManager.createQuery("delete from InventoryMediaObject m where m.objectKey=:key and m.purgeLease=:lease and m.resourceType is null").setParameter("key",key).setParameter("lease",lease).executeUpdate();}

    public int deleteRecord(String key) {
        return entityManager.createQuery("delete from InventoryMediaObject m where m.objectKey = :key")
                .setParameter("key", key).executeUpdate();
    }

    public int deleteStagedRecord(String key) {
        return entityManager.createQuery("delete from InventoryMediaObject m where m.objectKey = :key and m.resourceType is null")
                .setParameter("key", key).executeUpdate();
    }
}
