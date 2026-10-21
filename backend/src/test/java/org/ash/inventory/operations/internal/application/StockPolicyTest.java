package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class StockPolicyTest {
    private static AssetInstance asset(DomainEnums.AssetState state, DomainEnums.ConditionStatus condition) {
        var asset = new AssetInstance();
        asset.availabilityStatus = state;
        asset.conditionStatus = condition;
        asset.active = true;
        return asset;
    }

    @Test void damageReportedWhileOutKeepsAssetCheckedOut() {
        var out = asset(DomainEnums.AssetState.in_field, DomainEnums.ConditionStatus.damaged);
        assertTrue(StockPolicy.checkedOut(out));
        assertEquals(1, StockPolicy.classify(out).checkedOut());
        assertFalse(StockPolicy.checkedOut(asset(DomainEnums.AssetState.damaged, DomainEnums.ConditionStatus.damaged)));
    }

    @Test void returnedAssetStaysUnavailableWhileDamageIsOpen() {
        assertEquals(DomainEnums.AssetState.damaged,
                StockPolicy.returnedState(asset(DomainEnums.AssetState.in_field, DomainEnums.ConditionStatus.damaged)));
        assertEquals(DomainEnums.AssetState.damaged,
                StockPolicy.returnedState(asset(DomainEnums.AssetState.in_custody, DomainEnums.ConditionStatus.unsafe)));
        assertEquals(DomainEnums.AssetState.available,
                StockPolicy.returnedState(asset(DomainEnums.AssetState.in_field, DomainEnums.ConditionStatus.good)));
    }
}
