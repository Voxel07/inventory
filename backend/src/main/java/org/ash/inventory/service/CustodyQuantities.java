package org.ash.inventory.service;

import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.GeneralOrder;

/** Missing units remain outstanding until an explicit return or write-off settles them. */
public final class CustodyQuantities {
    private CustodyQuantities() {}
    public static int outstanding(int handedOver, int returned, int consumed, int damaged, int writtenOff) {
        return handedOver - returned - consumed - damaged - writtenOff;
    }
    public static int outstanding(FactionOrderLine line) {
        return outstanding(line.handedOverQuantity, line.returnedQuantity, line.consumedQuantity, line.damagedQuantity, line.writtenOffQuantity);
    }
    public static int outstanding(GeneralOrder order, String itemId) {
        return outstanding(order.handedOverQuantities.getOrDefault(itemId, 0), order.returnedQuantities.getOrDefault(itemId, 0),
                order.consumedQuantities.getOrDefault(itemId, 0), order.damagedQuantities.getOrDefault(itemId, 0), order.writtenOffQuantities.getOrDefault(itemId, 0));
    }
}
