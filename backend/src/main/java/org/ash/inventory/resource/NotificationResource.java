package org.ash.inventory.resource;

import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.ApiQueryService;

import java.util.List;
import java.util.UUID;

@Path("/api/notifications")
@Produces(MediaType.APPLICATION_JSON)
public class NotificationResource {
    private final ApiQueryService queries;

    public NotificationResource(ApiQueryService queries) {
        this.queries = queries;
    }

    @GET
    public List<ApiResponses.NotificationResponse> list(
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.notifications(page, size);
    }

    @PATCH @Path("/{id}/read")
    public ApiResponses.NotificationResponse read(@PathParam("id") UUID id) {
        return queries.markNotificationRead(id);
    }
}
