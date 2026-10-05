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

    /**
     * Source used when preparation names none: the item's default location while it covers the quantity,
     * otherwise the internal location with the most free stock (so stock spread over several places stays preparable).
     */
    public StorageLocation defaultSource(Item item, int quantity, UUID factionOrderId, UUID generalOrderId) {
        var fallback = item.storageLocation;
        if (item.trackingMode == DomainEnums.TrackingMode.serialized || quantity <= 0) return fallback;
        int best = fallback == null ? -1 : positions.availableAt(item, fallback, factionOrderId, generalOrderId);
        if (best >= quantity) return fallback;
        var chosen = fallback;
        for (var location : positions.stockLocations(item)) {
            if ((fallback != null && location.id.equals(fallback.id)) || !equipment.isInternalSource(item, location)) continue;
            int available = positions.availableAt(item, location, factionOrderId, generalOrderId);
            if (available > best) { best = available; chosen = location; }
        }
        return chosen;
    }

    public void assertAssetEligible(AssetInstance asset, EventOccurrence event) {
        inventory.assertAssetCheckoutAllowed(asset);
        equipment.assertAsset(asset, event);
    }
}
