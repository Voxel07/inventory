package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.RuntimeEntry;

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
