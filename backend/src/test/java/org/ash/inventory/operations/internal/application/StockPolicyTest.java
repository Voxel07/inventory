package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.InventoryAccessPolicy;
import org.ash.inventory.operations.internal.model.EquipmentCommitment;
import org.ash.inventory.operations.internal.model.LoanArrangement;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class StockPolicyTest {
    @Test void privateItemsUseUsableStockWithoutCommitmentsAndStillRespectDamageAndMaintenance() {
        var item = new Item(); item.ownershipType = Item.Ownership.private_owner;
        item.accessPolicy = new InventoryAccessPolicy();
        var policy = new EquipmentPolicy();
        var physical = new StockState(8, 0, 0, 1, 2, 5);
        class Facts implements EquipmentPolicy.AvailabilityData {
            boolean damaged, usable = true;
            public boolean hasMemberDamage() { return damaged; }
            public boolean itemUsable() { return usable; }
            public List<EquipmentCommitment> commitments() { throw new AssertionError("Private stock must not read commitments"); }
            public LoanArrangement loan(EquipmentCommitment commitment) { throw new AssertionError(); }
            public List<AssetInstance> assets() { return List.of(); }
            public boolean usable(AssetInstance asset) { return true; }
            public int consumedDuring(EquipmentCommitment commitment) { throw new AssertionError(); }
            public int internalQuantity(UUID provider) { throw new AssertionError(); }
        }
        var facts = new Facts();
        for (boolean publicUse : List.of(false, true)) {
            item.accessPolicy.publicUse = publicUse;
            assertTrue(EquipmentPolicy.freelyAvailable(item));
            assertEquals(5, policy.available(item, null, physical, 0, facts));
            assertEquals(7, policy.available(item, null, physical, 2, facts));
        }
        facts.damaged = true;
        assertEquals(0, policy.available(item, null, physical, 0, facts));
        facts.damaged = false; facts.usable = false;
        assertEquals(0, policy.available(item, null, physical, 0, facts));
    }

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
