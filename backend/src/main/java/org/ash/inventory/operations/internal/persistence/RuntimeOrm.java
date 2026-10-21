package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.RuntimeEntry;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;

/** Persistence queries for runtime bookings. */
@ApplicationScoped
public class RuntimeOrm extends EntityOrm {
    public List<RuntimeEntry> forAsset(AssetInstance asset, int offset, int limit) {
        return entityManager.createQuery("from RuntimeEntry r left join fetch r.eventOccurrence left join fetch r.order left join fetch r.recordedBy"
                        + " where r.assetInstance = :asset order by r.recordedAt desc, r.id", RuntimeEntry.class)
                .setParameter("asset", asset).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<RuntimeEntry> forItem(Item item, int offset, int limit) {
        return entityManager.createQuery("from RuntimeEntry r left join fetch r.assetInstance left join fetch r.eventOccurrence left join fetch r.order left join fetch r.recordedBy"
                        + " where r.item = :item order by r.recordedAt desc, r.id", RuntimeEntry.class)
                .setParameter("item", item).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
}
