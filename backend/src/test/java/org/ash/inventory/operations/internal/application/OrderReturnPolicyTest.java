package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.platform.api.ApiException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class OrderReturnPolicyTest {
    @Test void overflowingReturnsCannotBypassOutstandingCheck() {
        var outcome = new OrderReturnPolicy.Outcome(Integer.MAX_VALUE, Integer.MAX_VALUE, 0, 10, null);
        assertEquals(4294967294L, outcome.reconciled());
        assertEquals(400, assertThrows(ApiException.class,
                () -> OrderReturnPolicy.validate(new Item(), outcome, 10, null)).status);
    }

    @Test void negativeReturnsAreRejectedAndValidReturnsStillWork() {
        assertThrows(ApiException.class, () -> OrderReturnPolicy.validate(new Item(),
                new OrderReturnPolicy.Outcome(-1, 0, 0, 0, null), 10, null));
        assertDoesNotThrow(() -> OrderReturnPolicy.validate(new Item(),
                new OrderReturnPolicy.Outcome(4, 2, 0, 4, null), 10, null));
    }
}
