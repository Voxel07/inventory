package org.ash.inventory.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class InventoryModelInvariantTest {
    @Test
    void bulkAvailabilityExcludesReservedQuarantinedAndDamagedStock() {
        var position = new InventoryPosition();
        position.quantityOnHand = 20;
        position.quantityReserved = 5;
        position.quantityQuarantined = 2;
        position.quantityDamaged = 3;
        assertEquals(10, position.availableQuantity());
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
}
