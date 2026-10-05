package org.ash.inventory.resource;

import io.quarkus.security.identity.SecurityIdentity;
import io.smallrye.common.annotation.Blocking;
import io.smallrye.mutiny.Multi;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.helper.event.EventBroadcaster;
import org.ash.inventory.helper.security.ActorService;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.jboss.resteasy.reactive.RestStreamElementType;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;

/**
 * Server-Sent Events carrying change notifications for client cache invalidation.
 *
 * <p>Broadcast classification: every authenticated session receives only the event family
 * ({@code stock.changed}, {@code order.changed}, …) and, for catalog changes, the catalog resource
 * kind. Aggregate IDs, actors, quantities and payloads are never sent. {@code access.*} events are
 * sent as {@code access.changed} so clients evict cached private data. The stream ends when the
 * bearer token expires; the client reconnects with a fresh token.
 */
@Path("/api/events/stream")
public class EventStreamResource {
    static final Duration MAX_STREAM = Duration.ofHours(1);
    private static final Set<String> CATALOG_RESOURCES = Set.of("items", "assemblies", "storage-locations", "events",
            "factions", "category-maintenance");

    private final EventBroadcaster broadcaster;
    private final ActorService actors;
    private final SecurityIdentity identity;

    public EventStreamResource(EventBroadcaster broadcaster, ActorService actors, SecurityIdentity identity) {
        this.broadcaster = broadcaster;
        this.actors = actors;
        this.identity = identity;
    }

    @GET
    @Blocking
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<Map<String, Object>> stream() {
        actors.current();
        Duration lifetime = lifetime(identity.isAnonymous() ? null : identity.getPrincipal(), Instant.now());
        if (lifetime.isZero()) throw new ApiException(401, "Token expired");
        return broadcaster.stream().map(EventStreamResource::publicEvent).select().first(lifetime);
    }

    static Duration lifetime(Object principal, Instant now) {
        if (!(principal instanceof JsonWebToken token) || token.getExpirationTime() <= 0) return MAX_STREAM;
        var remaining = Duration.between(now, Instant.ofEpochSecond(token.getExpirationTime()));
        if (remaining.isNegative()) return Duration.ZERO;
        return remaining.compareTo(MAX_STREAM) > 0 ? MAX_STREAM : remaining;
    }

    static Map<String, Object> publicEvent(Map<String, Object> event) {
        String type = String.valueOf(event.get("type"));
        if ("heartbeat".equals(type)) return Map.of("type", "heartbeat");
        int separator = type.indexOf('.');
        String family = separator > 0 ? type.substring(0, separator) : "inventory";
        if ("access".equals(family)) return Map.of("type", "access.changed");
        if ("catalog".equals(family)) {
            Object resource = event.get("resource");
            return resource != null && CATALOG_RESOURCES.contains(resource.toString())
                    ? Map.of("type", "catalog.changed", "resource", resource.toString())
                    : Map.of("type", "catalog.changed");
        }
        return Map.of("type", family + ".changed");
    }
}
