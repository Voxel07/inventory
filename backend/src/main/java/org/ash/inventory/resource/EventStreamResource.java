package org.ash.inventory.resource;

import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.helper.event.EventBroadcaster;
import org.ash.inventory.helper.security.ActorService;
import org.jboss.resteasy.reactive.RestStreamElementType;

import java.util.Map;

/**
 * Server-Sent Events endpoint streaming real-time status transitions and inventory movements.
 */
@Path("/api/events/stream")
public class EventStreamResource {
    @Inject EventBroadcaster broadcaster;
    @Inject ActorService actors;

    @GET
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<Map<String, Object>> stream() {
        actors.current();
        return broadcaster.stream();
    }
}
