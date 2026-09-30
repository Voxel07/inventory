package org.ash.inventory.service;

import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DomainEnums;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class MaintenancePolicyTest {
    private static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");
    private static final MaintenancePolicy.Counters COUNTERS = new MaintenancePolicy.Counters(BigDecimal.TEN, 10, BigDecimal.ONE, 1);

    @Test void dateBoundariesRetainFractionalWarningWindows() {
        for (int seconds : new int[]{-1, 0, 1, 43200, 43201}) {
            var facts = new MaintenancePolicy.Facts(null, DomainEnums.MaintenanceIntervalType.date,
                    NOW.plusSeconds(seconds), null, new BigDecimal("0.5"));
            var expected = seconds <= 0 ? MaintenancePolicy.Status.due : seconds <= 43200 ? MaintenancePolicy.Status.warning : MaintenancePolicy.Status.healthy;
            assertEquals(expected, MaintenancePolicy.status(facts, NOW, COUNTERS));
        }
    }

    @Test void hourAndUsageSchedulesSelectTheirOwnScopeAndExactBoundaries() {
        for (var type : new DomainEnums.MaintenanceIntervalType[]{DomainEnums.MaintenanceIntervalType.operating_hours, DomainEnums.MaintenanceIntervalType.usage_count}) {
            var item = new MaintenancePolicy.Facts(null, type, null, BigDecimal.TEN, BigDecimal.ONE);
            var asset = new MaintenancePolicy.Facts(UUID.randomUUID(), type, null, BigDecimal.TEN, BigDecimal.ONE);
            assertEquals(MaintenancePolicy.Status.due, MaintenancePolicy.status(item, NOW, COUNTERS));
            assertEquals(MaintenancePolicy.Status.healthy, MaintenancePolicy.status(asset, NOW, COUNTERS));
            assertEquals(MaintenancePolicy.Status.warning, MaintenancePolicy.status(item, NOW,
                    new MaintenancePolicy.Counters(new BigDecimal("9"), 9, null, 0)));
        }
    }

    @Test void missingThresholdsAndHourMetersBlockCheckout() {
        for (var type : DomainEnums.MaintenanceIntervalType.values()) {
            var facts = new MaintenancePolicy.Facts(null, type, null, null, BigDecimal.ZERO);
            assertEquals(MaintenancePolicy.Status.unknown, MaintenancePolicy.status(facts, NOW, COUNTERS));
            assertTrue(MaintenancePolicy.blocksCheckout(MaintenancePolicy.status(facts, NOW, COUNTERS)));
        }
        var hours = new MaintenancePolicy.Facts(UUID.randomUUID(), DomainEnums.MaintenanceIntervalType.operating_hours, null, BigDecimal.TEN, BigDecimal.ZERO);
        assertEquals(MaintenancePolicy.Status.unknown, MaintenancePolicy.status(hours, NOW,
                new MaintenancePolicy.Counters(BigDecimal.TEN, 0, null, 0)));
        assertFalse(MaintenancePolicy.blocksCheckout(MaintenancePolicy.Status.warning));
    }

    @Test void serializedStockSeparatesTransitCustodyAndRemovedAssets() {
        var asset = new AssetInstance();
        asset.availabilityStatus = DomainEnums.AssetState.in_transit;
        assertEquals(new StockPolicy.AssetStock(0, 0, 1, 0, 0, 0), StockPolicy.classify(asset));
        asset.availabilityStatus = DomainEnums.AssetState.returned_pending_check;
        assertEquals(new StockPolicy.AssetStock(0, 1, 0, 0, 0, 0), StockPolicy.classify(asset));
        asset.availabilityStatus = DomainEnums.AssetState.damaged;
        assertEquals(new StockPolicy.AssetStock(1, 0, 0, 1, 0, 0), StockPolicy.classify(asset));
        asset.active = false;
        assertEquals(new StockPolicy.AssetStock(0, 0, 0, 0, 0, 0), StockPolicy.classify(asset));
        asset.active = true; asset.availabilityStatus = DomainEnums.AssetState.lost;
        assertEquals(new StockPolicy.AssetStock(0, 0, 0, 0, 0, 0), StockPolicy.classify(asset));
    }
}
