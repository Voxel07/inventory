package org.ash.inventory.service;

import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DomainEnums;

/** Physical stock categories; maintenance and equipment consent further restrict availability. */
public final class StockPolicy {
    private StockPolicy() {}
    public record AssetStock(int onHand, int checkedOut, int inTransit, int damaged, int reserved, int available) {}

    /** Checked out or returned awaiting inspection: the custody owns the availability state. */
    public static boolean checkedOut(AssetInstance asset) {
        return asset.availabilityStatus == DomainEnums.AssetState.in_field
                || asset.availabilityStatus == DomainEnums.AssetState.in_custody
                || asset.availabilityStatus == DomainEnums.AssetState.returned_pending_check;
    }

    /** State of an asset coming back to stock: a damage reported while it was out keeps it out of availability. */
    public static DomainEnums.AssetState returnedState(AssetInstance asset) {
        return asset.conditionStatus == DomainEnums.ConditionStatus.damaged
                || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe
                ? DomainEnums.AssetState.damaged : DomainEnums.AssetState.available;
    }

    public static AssetStock classify(AssetInstance asset) {
        if (!asset.active || asset.availabilityStatus == DomainEnums.AssetState.lost
                || asset.availabilityStatus == DomainEnums.AssetState.written_off
                || asset.conditionStatus == DomainEnums.ConditionStatus.lost) return new AssetStock(0, 0, 0, 0, 0, 0);
        return switch (asset.availabilityStatus) {
            case in_transit -> new AssetStock(0, 0, 1, 0, 0, 0);
            case in_custody, in_field, returned_pending_check -> new AssetStock(0, 1, 0, 0, 0, 0);
            default -> {
                boolean damaged = asset.availabilityStatus == DomainEnums.AssetState.damaged
                        || asset.availabilityStatus == DomainEnums.AssetState.in_repair
                        || asset.conditionStatus == DomainEnums.ConditionStatus.damaged
                        || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe;
                boolean reserved = asset.availabilityStatus == DomainEnums.AssetState.reserved
                        || asset.availabilityStatus == DomainEnums.AssetState.staged;
                yield new AssetStock(1, 0, 0, damaged ? 1 : 0, reserved ? 1 : 0,
                        !damaged && asset.availabilityStatus == DomainEnums.AssetState.available ? 1 : 0);
            }
        };
    }
}
