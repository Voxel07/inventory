package org.ash.inventory.operations.adapter.rest;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EventStreamResourceTest {
    private static final Set<String> SELF = Set.of("own-account");

    @Test
    void broadcastsOnlyTheEventFamilyAndCatalogResourceKind() {
        assertEquals(Map.of("type", "stock.changed"), EventStreamResource.publicEvent(Map.of(
                "type", "stock.changed", "itemId", "secret", "actorId", "secret", "quantity", 3), SELF));
        assertEquals(Map.of("type", "order.changed"), EventStreamResource.publicEvent(Map.of("type", "order.picked_up", "orderId", "x"), SELF));
        assertEquals(Map.of("type", "catalog.changed", "resource", "items"),
                EventStreamResource.publicEvent(Map.of("type", "catalog.changed", "resource", "items", "id", "x"), SELF));
        assertEquals(Map.of("type", "catalog.changed"),
                EventStreamResource.publicEvent(Map.of("type", "catalog.changed", "resource", "unexpected"), SELF));
        assertEquals(Map.of("type", "access.changed"), EventStreamResource.publicEvent(Map.of("type", "access.changed", "policyId", "x"), SELF));
        assertEquals(Map.of("type", "heartbeat"), EventStreamResource.publicEvent(Map.of("type", "heartbeat", "timestamp", "t"), SELF));
    }

    @Test
    void userEventsRefreshAccessOnlyOnTheAffectedAccountsStream() {
        assertEquals(Map.of("type", "user.changed"), EventStreamResource.publicEvent(Map.of(
                "type", "user.changed", "aggregateId", "own-account", "roles", "secret"), SELF));
        assertEquals(Map.of("type", "users.changed"), EventStreamResource.publicEvent(Map.of(
                "type", "user.created", "aggregateId", "someone-else", "roles", "secret"), SELF));
    }

    @Test
    void streamsWithoutABearerTokenAreBounded() {
        assertEquals(Duration.ofHours(1), EventStreamResource.lifetime(null, Instant.now()));
    }
}
