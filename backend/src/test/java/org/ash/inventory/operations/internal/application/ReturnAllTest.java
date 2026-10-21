package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.OrderHistory;
import org.ash.inventory.operations.internal.model.OrderLine;
import org.ash.inventory.operations.internal.model.OrderLineAssetAssignment;
import org.ash.inventory.operations.internal.persistence.OrderOrm;
import org.ash.inventory.operations.internal.security.ActorService;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ReturnAllTest {
    @Test void replayAfterFullReturnDoesNotBuildAnEmptyReturnCommand() {
        var order = new InventoryOrder(); order.id = UUID.randomUUID();
        var orm = new OrderOrm() {
            @Override public InventoryOrder findLockedOrder(UUID id) { return order; }
            @Override public InventoryOrder orderByHistoryIdempotencyKey(UUID key) { return order; }
        };
        var actors = new ActorService(null, null, null, false, "", Optional.empty()) {
            @Override public void requireWarehouse() {}
        };
        assertSame(order, new OrderService(orm, actors, null, null, null).returnAll(order.id, UUID.randomUUID()));
    }

    @Test void onlyPositiveOutstandingQuantitiesAreReturnedFromPartialPreparation() {
        var order = new InventoryOrder(); order.id = UUID.randomUUID();
        var handedOver = new Item(); var neverPrepared = new Item(); var alreadyReturned = new Item();
        handedOver.id = UUID.randomUUID(); neverPrepared.id = UUID.randomUUID(); alreadyReturned.id = UUID.randomUUID();
        var first = new OrderLine(); first.item = handedOver; first.handedOverQuantity = 3; first.returnedQuantity = 1;
        var second = new OrderLine(); second.item = neverPrepared; second.requestedQuantity = 4;
        var third = new OrderLine(); third.item = alreadyReturned; third.handedOverQuantity = 1; third.returnedQuantity = 1;
        var orm = new OrderOrm() {
            @Override public InventoryOrder findLockedOrder(UUID id) { return order; }
            @Override public List<OrderLine> lines(InventoryOrder ignored) { return List.of(first, second, third); }
            @Override public List<OrderLineAssetAssignment> assetAssignments(InventoryOrder ignored) { return List.of(); }
            @Override public List<OrderHistory> history(InventoryOrder ignored) { return List.of(); }
            @Override public InventoryOrder orderByHistoryIdempotencyKey(UUID key) { return null; }
        };
        var actors = new ActorService(null, null, null, false, "", Optional.empty()) {
            @Override public void requireWarehouse() {}
        };
        var service = new OrderService(orm, actors, null, null, null) {
            @Override public InventoryOrder returnItems(UUID id, ApiModels.ReturnInput input) {
                assertEquals(Set.of(handedOver.id), input.lines().keySet());
                assertEquals(2, input.lines().get(handedOver.id).returned());
                return order;
            }
        };
        assertSame(order, service.returnAll(order.id, UUID.randomUUID()));
    }
}
