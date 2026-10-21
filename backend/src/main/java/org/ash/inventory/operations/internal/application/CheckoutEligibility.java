package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.persistence.EquipmentOrm;
import org.ash.inventory.operations.internal.persistence.OperationsOrm;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Instant;
/** Current maintenance and damage eligibility, shared without command-service callbacks. */
@ApplicationScoped
public class CheckoutEligibility {
    @Inject OperationsOrm orm;
    @Inject EquipmentOrm equipmentFacts;
    @Inject MaintenanceEvaluationService maintenance;
    public void assertAssetCheckoutAllowed(AssetInstance asset) {
        if (asset.conditionStatus == DomainEnums.ConditionStatus.damaged
                || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe
                || asset.conditionStatus == DomainEnums.ConditionStatus.lost) {
            throw ApiException.conflict("Asset " + asset.assetCode + " is blocked because its condition is "
                    + asset.conditionStatus);
        }
        if (MaintenancePolicy.blocksAsset(asset, BusinessTime.today())) {
            throw ApiException.conflict("Asset " + asset.assetCode + " is blocked because its service status is "
                    + MaintenancePolicy.assetStatus(asset, BusinessTime.today()));
        }
        assertNoBlockingScheduleIsDue(asset.item, asset);
    }

    public void assertCheckoutAllowed(Item item) {
        if (equipmentFacts.openMemberDamage(item) > 0) throw ApiException.conflict("Warehouse must review the open contributor damage report before checkout");
        if (MaintenancePolicy.blocksItem(item, BusinessTime.today())) {
            throw ApiException.conflict("Item " + item.name + " is blocked from checkout because maintenance status is "
                    + MaintenancePolicy.itemStatus(item, BusinessTime.today()));
        }
        assertNoBlockingScheduleIsDue(item, null);
    }

    private void assertNoBlockingScheduleIsDue(Item item, AssetInstance asset) {
        var now = Instant.now();
        for (var schedule : orm.blockingSchedules(item, asset)) {
            var status = maintenance.status(schedule, now);
            if (MaintenancePolicy.blocksCheckout(status)) {
                throw ApiException.conflict("Checkout is blocked by " + status + " " + schedule.maintenanceType
                        + " maintenance");
            }
        }
    }

}
