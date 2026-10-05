package org.ash.inventory.resource;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.cache.*;
import io.smallrye.mutiny.Uni;
import org.ash.inventory.helper.event.EventBroadcaster;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Proxy;
import java.util.*;
import java.util.concurrent.atomic.*;
import java.util.function.Function;
import static org.junit.jupiter.api.Assertions.*;

class CatalogResponsesTest {
    static class Backend {
        final Map<Object, String> values = new HashMap<>();
        boolean failedLoad, failedEviction;
        final Cache cache = (Cache) Proxy.newProxyInstance(Cache.class.getClassLoader(), new Class[]{Cache.class}, (proxy, method, args) -> {
            return switch (method.getName()) {
                case "getName" -> "factions-cache";
                case "get" -> failedLoad ? Uni.createFrom().failure(new IllegalStateException("Cache unavailable"))
                    : Uni.createFrom().item(() -> values.computeIfAbsent(args[0], key -> ((Function<Object, String>) args[1]).apply(key)));
                case "invalidateAll" -> failedEviction ? Uni.createFrom().failure(new IllegalStateException("Eviction unavailable"))
                    : Uni.createFrom().item(() -> { values.clear(); return null; });
                default -> throw new UnsupportedOperationException(method.getName());
            };
        });
    }
    static class Replica extends CatalogResponses {
        final AtomicReference<String> database; int loads; RuntimeException databaseFailure;
        Replica(Backend backend, AtomicReference<String> database) { super(null, null, new ObjectMapper(), backend.cache); this.database = database; }
        @Override String loadFactions() { loads++; if (databaseFailure != null) throw databaseFailure; return database.get(); }
    }
    @Test void failedEvictionAndPublicationCannotSelectOldRevisionOnEitherReplica() {
        var backend = new Backend(); var source = new AtomicReference<>("old");
        var first = new Replica(backend, source); var second = new Replica(backend, source);
        assertEquals("old", first.cachedFactions("epoch:1")); assertEquals("old", second.cachedFactions("epoch:1")); assertEquals(0, second.loads);
        backend.failedEviction = true;
        assertThrows(RuntimeException.class, () -> backend.cache.invalidateAll().await().indefinitely());
        // Fan-out can fail after local delivery; the revision does not depend on this consumer.
        @SuppressWarnings("unchecked") var unavailable = (jakarta.enterprise.inject.Instance<io.quarkus.redis.datasource.RedisDataSource>) Proxy.newProxyInstance(
                jakarta.enterprise.inject.Instance.class.getClassLoader(), new Class[]{jakarta.enterprise.inject.Instance.class},
                (proxy, method, args) -> method.getName().equals("isResolvable") ? false : null);
        var broadcaster = new EventBroadcaster(unavailable, new ObjectMapper(), "redis");
        var event = Map.<String,Object>of("eventId", UUID.randomUUID().toString(), "resource", "factions");
        assertThrows(RuntimeException.class, () -> broadcaster.broadcast("catalog.changed", event));
        source.set("committed");
        assertEquals("committed", second.cachedFactions("epoch:2")); assertEquals("committed", first.cachedFactions("epoch:2"));
        assertThrows(RuntimeException.class, () -> broadcaster.broadcast("catalog.changed", event));
        assertEquals("committed", first.cachedFactions("epoch:2"));
    }
    @Test void oldConcurrentFillCannotOverwriteNewRevision() {
        var backend = new Backend(); var source = new AtomicReference<>("new"); var replica = new Replica(backend, source);
        assertEquals("new", replica.cachedFactions("epoch:2"));
        backend.values.put("epoch:1", "late old fill");
        assertEquals("new", replica.cachedFactions("epoch:2")); assertEquals(1, replica.loads);
    }
    @Test void cacheOutageFallsBackToDatabaseAndDatabaseFailuresPropagateOnce() {
        var backend = new Backend(); var source = new AtomicReference<>("database"); var replica = new Replica(backend, source);
        backend.failedLoad = true; assertEquals("database", replica.cachedFactions("epoch:3")); assertEquals(1, replica.loads);
        backend.failedLoad = false; replica.databaseFailure = new IllegalStateException("DB unavailable");
        assertSame(replica.databaseFailure, assertThrows(RuntimeException.class, () -> replica.cachedFactions("epoch:4")));
        assertEquals(2, replica.loads, "Do not mask/retry a failed database loader as a cache outage");
    }
}
