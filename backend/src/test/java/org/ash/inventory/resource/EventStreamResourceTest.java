package org.ash.inventory.resource;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EventStreamResourceTest {
    @Test
    void broadcastsOnlyTheEventFamilyAndCatalogResourceKind() {
        assertEquals(Map.of("type", "stock.changed"), EventStreamResource.publicEvent(Map.of(
                "type", "stock.changed", "itemId", "secret", "actorId", "secret", "quantity", 3)));
        assertEquals(Map.of("type", "order.changed"), EventStreamResource.publicEvent(Map.of("type", "order.picked_up", "orderId", "x")));
        assertEquals(Map.of("type", "catalog.changed", "resource", "items"),
                EventStreamResource.publicEvent(Map.of("type", "catalog.changed", "resource", "items", "id", "x")));
        assertEquals(Map.of("type", "catalog.changed"),
                EventStreamResource.publicEvent(Map.of("type", "catalog.changed", "resource", "unexpected")));
        assertEquals(Map.of("type", "access.changed"), EventStreamResource.publicEvent(Map.of("type", "access.changed", "policyId", "x")));
        assertEquals(Map.of("type", "heartbeat"), EventStreamResource.publicEvent(Map.of("type", "heartbeat", "timestamp", "t")));
    }

    @Test
    void streamsWithoutABearerTokenAreBounded() {
        assertEquals(Duration.ofHours(1), EventStreamResource.lifetime(null, Instant.now()));
    }
}
