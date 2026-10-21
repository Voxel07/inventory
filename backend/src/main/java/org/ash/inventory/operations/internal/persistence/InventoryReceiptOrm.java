package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;
@ApplicationScoped
public class InventoryReceiptOrm extends EntityOrm {
    public InventoryPosition lockedPosition(Item item, StorageLocation location, InventoryLot lot) {
        var jpql = lot == null
                ? "from InventoryPosition position where position.item = :item and position.location = :location and position.lot is null"
                : "from InventoryPosition position where position.item = :item and position.location = :location and position.lot = :lot";
        var query = entityManager.createQuery(jpql, InventoryPosition.class)
                .setParameter("item", item).setParameter("location", location);
        if (lot != null) query.setParameter("lot", lot);
        return query.setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultStream().findFirst().orElse(null);
    }
}
