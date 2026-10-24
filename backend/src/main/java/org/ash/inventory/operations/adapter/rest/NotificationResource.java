package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.notification.api.NtfyPublisher;
import org.ash.inventory.operations.internal.application.ApiQueryService;
import org.ash.inventory.operations.internal.application.UserService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.security.ActorService;

import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import java.util.UUID;

@Path("/api/notifications")
@Produces(MediaType.APPLICATION_JSON)
public class NotificationResource {
    private final ApiQueryService queries;
    private final UserService users;
    private final ActorService actors;
    private final NtfyPublisher ntfy;

    public NotificationResource(ApiQueryService queries, UserService users, ActorService actors, NtfyPublisher ntfy) {
        this.queries = queries;
        this.users = users;
        this.actors = actors;
        this.ntfy = ntfy;
    }

    /** Newest first; {@code unread=true} pages unread notices server-side so read ones never hide them. */
    @Paged @GET
    public List<ApiResponses.NotificationResponse> list(
            @QueryParam("unread") @DefaultValue("false") boolean unread,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.notifications(unread, page, size);
    }

    /** {@code before}: newest notice the user has seen; unread notices up to it are marked read, including unloaded pages. */
    public record ReadAllInput(java.time.Instant before) {}

    @jakarta.ws.rs.POST @Path("/read-all")
    public java.util.Map<String, Integer> readAll(ReadAllInput input) {
        return java.util.Map.of("count", queries.markAllNotificationsRead(input == null ? null : input.before()));
    }

    @GET @Path("/unread-count")
    public java.util.Map<String, Long> unreadCount() {
        return java.util.Map.of("count", queries.unreadNotificationCount());
    }

    @PATCH @Path("/{id}/read")
    public ApiResponses.NotificationResponse read(@PathParam("id") UUID id) {
        return queries.markNotificationRead(id);
    }

    /** The current user's ntfy push topic; the server URL and credentials come from deployment configuration. */
    @GET @Path("/ntfy")
    public ApiResponses.NtfySettingsResponse ntfySettings() {
        return new ApiResponses.NtfySettingsResponse(ntfy.server().orElse(null), actors.current().ntfyTopic);
    }

    @PUT @Path("/ntfy") @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponses.NtfySettingsResponse updateNtfySettings(@jakarta.validation.constraints.NotNull @Valid ApiModels.NtfySettingsInput input) {
        return new ApiResponses.NtfySettingsResponse(ntfy.server().orElse(null), users.updateNtfyTopic(input.topic()).ntfyTopic);
    }
}
