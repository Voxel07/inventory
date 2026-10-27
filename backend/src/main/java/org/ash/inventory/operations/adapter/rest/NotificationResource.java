package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.notification.api.NtfyPublisher;
import org.ash.inventory.operations.internal.application.ApiQueryService;
import org.ash.inventory.operations.internal.application.UserService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Path("/api/notifications")
@Produces(MediaType.APPLICATION_JSON)
public class NotificationResource {
    private final ApiQueryService queries;
    private final UserService users;
    private final ActorService actors;
    private final NtfyPublisher ntfy;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.NtfyTopicFeed adminTopics;

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

    /** The current user's delivery channels; the public ntfy URL and credentials come from deployment configuration. */
    @GET @Path("/settings")
    public ApiResponses.NotificationSettingsResponse settings() {
        return settings(actors.current());
    }

    @PUT @Path("/settings") @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponses.NotificationSettingsResponse updateSettings(@jakarta.validation.constraints.NotNull @Valid ApiModels.NotificationSettingsInput input) {
        return settings(users.updateNotificationSettings(input));
    }

    /** Publishes a fixed test message to the current user's saved ntfy topic so they can check their subscription. */
    @POST @Path("/settings/ntfy-test")
    public void ntfyTest() {
        var topic = actors.current().ntfyTopic;
        if (!ntfy.enabled()) throw ApiException.badRequest("ntfy is not configured for this deployment");
        if (topic == null) throw ApiException.badRequest("Save an ntfy topic first");
        if (adminTopics.reserved(topic)) throw ApiException.badRequest("This ntfy topic is reserved for administrator notifications");
        try {
            if (!ntfy.publish(new NtfyPublisher.Message(topic, "Inventory test notification",
                    "Your ntfy notifications are set up correctly.", null, List.of("white_check_mark"))))
                throw new ApiException(502, "The ntfy server rejected the test notification");
        } catch (IOException | IllegalArgumentException exception) {
            throw new ApiException(502, "The ntfy server is unavailable");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApiException(503, "The test notification was interrupted");
        }
    }

    private ApiResponses.NotificationSettingsResponse settings(UserAccount user) {
        return new ApiResponses.NotificationSettingsResponse(ntfy.publicUrl().orElse(null), user.ntfyTopic, user.webhookUrl);
    }
}
