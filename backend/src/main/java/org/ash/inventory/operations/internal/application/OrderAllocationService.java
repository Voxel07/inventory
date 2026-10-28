package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.Item;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.*;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

/** Preparation policy; OrderService owns item/asset locks, reservations and history for both kinds. */
@ApplicationScoped
public class OrderAllocationService {
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.CheckoutEligibility eligibility;
    @Inject EquipmentPolicy equipment;
    @Inject PositionService positions;
    @Inject ActorService actors;

    /** FEFO across operable sources; a null position records the separately reserved unlocated remainder.
     * Acknowledged shortages apply only to automatic allocation, never to explicit source choices. */
    public Map<InventoryPosition, Integer> allocate(Item item, PositionService.Capacity capacity, int quantity,
            Map<UUID, Integer> selected, boolean acknowledgeShortage) {
        var result = new LinkedHashMap<InventoryPosition, Integer>();
        if (quantity == 0) {
            if (selected != null && !selected.isEmpty()) throw ApiException.badRequest("No source is needed for zero prepared quantity");
            return result;
        }
        int left = quantity;
        var internal = equipment.internalSources(item);
        if (selected != null && selected.values().stream().mapToLong(Integer::longValue).sum() != quantity)
            throw ApiException.badRequest("Source quantities must equal the prepared quantity");
        for (var position : capacity.positions()) {
            int amount = selected == null ? Math.min(left, Math.max(0, position.availableQuantity() - capacity.reservedAt(position)))
                    : selected.getOrDefault(position.id, 0);
            if (amount == 0) continue;
            if (!internal.test(position.location) || !actors.canUseLocation(position.location)) {
                if (selected != null) throw ApiException.notFound("Source position not found");
                continue;
            }
            actors.requireLocationAccess(position.location, true);
            if (amount < 0 || amount > position.availableQuantity() - capacity.reservedAt(position))
                throw ApiException.conflict("Insufficient stock at the selected source for " + item.name);
            result.put(position, amount); left -= amount;
            if (left == 0) break;
        }
        if (selected != null && !result.keySet().stream().map(p -> p.id).collect(java.util.stream.Collectors.toSet()).containsAll(selected.keySet()))
            throw ApiException.badRequest("Sources must belong to the prepared item");
        if (selected == null && left > 0 && internal.test(null)) {
            int unlocated = Math.min(left, capacity.unlocatedAvailable());
            if (unlocated > 0) { result.put(null, unlocated); left -= unlocated; }
        }
        if (left > 0 && (selected != null || !acknowledgeShortage))
            throw ApiException.conflict("Insufficient stock across the accessible sources for " + item.name);
        return result;
    }

    /** Source facts of one item for one preparation, excluding the order's own previous reservation. */
    public PositionService.Capacity capacity(Item item, UUID orderId) {
        return positions.capacity(item, orderId);
    }

    public void assertAssetEligible(AssetInstance asset, EventOccurrence event) {
        eligibility.assertAssetCheckoutAllowed(asset);
        equipment.assertAsset(asset, event);
    }
}
