package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.DamageReport;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.PositionOrm;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ReturnedDamageTest {
    private static class Positions extends PositionOrm {
        final List<InventoryPosition> rows;
        Positions(List<InventoryPosition> rows) { super(null); this.rows = rows; }
        @Override public List<InventoryPosition> positions(Item item) { return rows; }
        @Override public <T> T find(Class<T> type, UUID id) {
            return rows.stream().filter(row -> row.id.equals(id)).map(type::cast).findFirst().orElse(null);
        }
        @Override public void lock(Item item) {}
    }

    @Test void damagedReturnAndWriteOffStayAtTheCheckinDestination() {
        var item = new Item(); item.id = UUID.randomUUID();
        var a = new InventoryPosition(); a.id = UUID.randomUUID(); a.item = item; a.location = new StorageLocation(); a.quantityOnHand = 10;
        var b = new InventoryPosition(); b.id = UUID.randomUUID(); b.item = item; b.location = new StorageLocation(); b.quantityOnHand = 3;
        var service = new PositionService(new Positions(List.of(a, b)));
        var checkin = new StockTransaction(); checkin.item = item;
        checkin.positionQuantities = Map.of(b.id.toString(), 2);
        var damage = new DamageReport(); damage.item = item; damage.quantity = 2;

        service.reportReturnedDamage(damage, checkin);
        assertEquals(0, a.quantityDamaged);
        assertEquals(2, b.quantityDamaged);
        assertEquals(Map.of(b.id.toString(), 2), damage.positionQuantities);

        var writeOff = new StockTransaction(); writeOff.item = item; writeOff.damageReport = damage;
        writeOff.type = DomainEnums.TransactionType.written_off; writeOff.quantity = 2;
        service.apply(writeOff);
        assertEquals(10, a.quantityOnHand);
        assertEquals(1, b.quantityOnHand);
        assertEquals(0, b.quantityDamaged);
        assertEquals(Map.of(b.id.toString(), -2), writeOff.positionQuantities);
    }

    @Test void unlocatedReturnDoesNotDamageStockAtAnotherLocation() {
        var item = new Item();
        var a = new InventoryPosition(); a.item = item; a.quantityOnHand = 5;
        var service = new PositionService(new Positions(List.of(a)));
        var checkin = new StockTransaction(); checkin.item = item;
        var damage = new DamageReport(); damage.item = item; damage.quantity = 2;
        service.reportReturnedDamage(damage, checkin);
        assertEquals(0, a.quantityDamaged);
        assertTrue(damage.positionQuantities.isEmpty());
    }
}
