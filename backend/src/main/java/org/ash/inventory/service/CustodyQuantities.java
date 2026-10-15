package org.ash.inventory.service;

import org.ash.inventory.model.OrderLine;

/** Missing units remain outstanding until an explicit return or write-off settles them. */
public final class CustodyQuantities {
    private CustodyQuantities() {}
    public static int outstanding(int handedOver, int returned, int consumed, int damaged, int writtenOff) {
        return handedOver - returned - consumed - damaged - writtenOff;
    }
    public static int outstanding(OrderLine line) {
        return outstanding(line.handedOverQuantity, line.returnedQuantity, line.consumedQuantity, line.damagedQuantity, line.writtenOffQuantity);
    }
}
