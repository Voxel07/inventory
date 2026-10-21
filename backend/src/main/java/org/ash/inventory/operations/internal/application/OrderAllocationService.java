package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.UUID;

/** Preparation policy; OrderService owns item/asset locks, reservations and history for both kinds. */
@ApplicationScoped
public class OrderAllocationService {
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.CheckoutEligibility eligibility;
    @Inject InventoryOperationsService inventory;
    @Inject EquipmentPolicy equipment;
    @Inject PositionService positions;

    /** Source facts of one item for one preparation, excluding the order's own previous reservation. */
    public PositionService.Capacity capacity(Item item, UUID orderId) {
        return positions.capacity(item, orderId);
    }

    public int sourceCapacity(Item item, PositionService.Capacity capacity, StorageLocation source, int preparedQuantity) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) return Integer.MAX_VALUE;
        if (preparedQuantity > 0) equipment.assertSource(item, source);
        return capacity.availableAt(source);
    }

    /**
     * Source used when preparation names none: the item's default location while it covers the quantity,
     * otherwise the internal location with the most free stock (so stock spread over several places stays preparable).
     */
    public StorageLocation defaultSource(Item item, PositionService.Capacity capacity, int quantity) {
        var fallback = item.storageLocation;
        if (item.trackingMode == DomainEnums.TrackingMode.serialized || quantity <= 0) return fallback;
        int best = fallback == null ? -1 : capacity.availableAt(fallback);
        if (best >= quantity) return fallback;
        var chosen = fallback;
        var internal = equipment.internalSources(item);
        for (var location : capacity.stockLocations()) {
            if ((fallback != null && location.id.equals(fallback.id)) || !internal.test(location)) continue;
            int available = capacity.availableAt(location);
            if (available > best) { best = available; chosen = location; }
        }
        return chosen;
    }

    public void assertAssetEligible(AssetInstance asset, EventOccurrence event) {
        eligibility.assertAssetCheckoutAllowed(asset);
        equipment.assertAsset(asset, event);
    }
}
