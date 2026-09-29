package org.ash.inventory.resource;

import io.smallrye.common.annotation.Blocking;
import io.smallrye.mutiny.Multi;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.helper.event.EventBroadcaster;
import org.ash.inventory.helper.security.ActorService;
import org.jboss.resteasy.reactive.RestStreamElementType;

import java.util.Map;

/**
 * Server-Sent Events endpoint streaming real-time status transitions and
 * inventory movements.
 */
@Path("/api/events/stream")
public class EventStreamResource {
    private final EventBroadcaster broadcaster;
    private final ActorService actors;

    public EventStreamResource(EventBroadcaster broadcaster, ActorService actors) {
        this.broadcaster = broadcaster;
        this.actors = actors;
    }

    @GET
    @Blocking
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<Map<String, Object>> stream() {
        actors.current();
        return broadcaster.stream().map(event -> {
            String type = String.valueOf(event.get("type"));
            // Shared SSE is an invalidation channel, not access to private agreement/request evidence.
            if (type.startsWith("member_request.") || type.startsWith("loan.") || type.startsWith("equipment.")
                    || type.equals("location.keeper_assigned")) {
                var signal = new java.util.LinkedHashMap<String, Object>();
                for (String key : java.util.List.of("type", "eventId", "timestamp", "occurredAt"))
                    if (event.containsKey(key)) signal.put(key, event.get(key));
                return signal;
            }
            return event;
        });
    }
}
