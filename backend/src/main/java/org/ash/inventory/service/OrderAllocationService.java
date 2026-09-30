package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.model.*;
import java.util.UUID;

/** Shared preparation policy. Aggregate services own item/asset locks, reservations and histories. */
@ApplicationScoped
public class OrderAllocationService {
    @Inject InventoryOperationsService inventory;
    @Inject EquipmentService equipment;
    @Inject PositionService positions;

    public int sourceCapacity(Item item, StorageLocation source, UUID factionOrderId, UUID generalOrderId, int preparedQuantity) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) return Integer.MAX_VALUE;
        if (preparedQuantity > 0) equipment.assertSource(item, source);
        return positions.availableAt(item, source, factionOrderId, generalOrderId);
    }

    public void assertAssetEligible(AssetInstance asset, EventOccurrence event) {
        inventory.assertAssetCheckoutAllowed(asset);
        equipment.assertAsset(asset, event);
    }
}
