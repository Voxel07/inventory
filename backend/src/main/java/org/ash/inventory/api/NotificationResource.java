package org.ash.inventory.api;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.domain.Notification;
import org.ash.inventory.security.ActorService;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

@Path("/api/notifications")
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class NotificationResource {
    @Inject ActorService actors;

    @GET
    public List<?> list() {
        var actor = actors.current();
        return Notification.<Notification>list("recipient = ?1 order by createdAt desc", actor).stream().map(this::view).toList();
    }

    @PATCH @Path("/{id}/read")
    public Object read(@PathParam("id") UUID id) {
        var actor = actors.current();
        var notification = Notification.<Notification>findById(id);
        if (notification == null || !notification.recipient.id.equals(actor.id)) throw ApiException.notFound("Notification not found");
        notification.readAt = Instant.now();
        return view(notification);
    }

    private Object view(Notification value) {
        var result = new LinkedHashMap<String, Object>();
        result.put("id", value.id);
        result.put("type", value.type);
        result.put("payload", value.payload);
        result.put("createdAt", value.createdAt);
        result.put("readAt", value.readAt);
        if (value.factionOrder != null) result.put("orderId", value.factionOrder.id);
        return result;
    }
}
