package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.operations.internal.persistence.IssueAllocationOrm;
import org.ash.inventory.operations.internal.persistence.PositionOrm;
import org.ash.inventory.platform.api.ApiException;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.*;

/** Returns preserve the lots actually issued. Settlement is append-only on the new movement. */
@ApplicationScoped
public class IssueAllocationService {
    @Inject IssueAllocationOrm issues;
    @Inject PositionOrm positions;

    public void settle(StockTransaction returned) {
        var settled = issues.settled(returned);
        int remaining = returned.quantity;
        var destination = returned.destinationLocation == null ? returned.item.storageLocation : returned.destinationLocation;
        if (!returned.custodyWriteOff && destination != null) LocationHierarchyService.requireActiveStockLocation(destination);
        var credits = new LinkedHashMap<String, Integer>();
        for (var checkout : issues.issues(returned)) {
            var allocations = checkout.positionQuantities.isEmpty() ? Map.of("unlocated", -checkout.quantity) : checkout.positionQuantities;
            for (var entry : allocations.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList()) {
                if (entry.getValue() >= 0) continue;
                var source = entry.getKey().equals("unlocated") ? null : issues.position(UUID.fromString(entry.getKey()));
                var lot = source == null ? checkout.lot : source.lot;
                if (returned.lot != null && !returned.lot.equals(lot)) continue;
                if (returned.item.trackingMode == DomainEnums.TrackingMode.lot_tracked && lot == null)
                    throw ApiException.conflict("Issued stock has no lot provenance");
                String key = checkout.id + ":" + entry.getKey();
                int take = Math.min(remaining, -entry.getValue() - settled.getOrDefault(key, 0));
                if (take <= 0) continue;
                returned.issueQuantities.put(key, take);
                if (!returned.custodyWriteOff && destination != null) {
                    var target = positions.position(returned.item, destination, lot);
                    target.quantityOnHand = Math.addExact(target.quantityOnHand, take);
                    credits.merge(target.id.toString(), take, Math::addExact);
                }
                remaining -= take;
                if (remaining == 0) break;
            }
            if (remaining == 0) break;
        }
        if (remaining != 0) throw ApiException.conflict("Return exceeds the remaining issued quantities for the selected custody or lot");
        returned.destinationLocation = returned.custodyWriteOff ? null : destination;
        returned.positionQuantities = credits;
    }
}
