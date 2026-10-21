package org.ash.inventory.operations.internal.model;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class InventoryModelInvariantTest {
    @Test
    void bulkAvailabilityExcludesQuarantinedAndDamagedStock() {
        var position = new InventoryPosition();
        position.quantityOnHand = 20;
        position.quantityQuarantined = 2;
        position.quantityDamaged = 3;
        assertEquals(15, position.availableQuantity());
    }

    @Test
    void reservationAndPurchaseOrderDerivedQuantitiesNeverGoNegative() {
        var reservation = new StockReservation();
        reservation.reservedQuantity = 4;
        reservation.releasedQuantity = 7;
        assertEquals(0, reservation.openQuantity());

        var line = new PurchaseOrderLine();
        line.orderedQuantity = 5;
        line.receivedQuantity = 8;
        assertEquals(0, line.remainingQuantity());
    }

    @Test
    void entityIdentityUsesStableUuidAndConcreteType() {
        UUID id = UUID.randomUUID();
        var first = new Item();
        var second = new Item();
        first.id = id;
        second.id = id;

        assertEquals(first, second);
        assertEquals(first.hashCode(), second.hashCode());
        assertNotEquals(first, new StorageLocation());
        assertNotEquals(new Item(), new Item());
    }
}
