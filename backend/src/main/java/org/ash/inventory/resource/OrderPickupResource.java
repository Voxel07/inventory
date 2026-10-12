package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.OrderPickupService;
import java.util.UUID;

@Path("/api/orders/{id}/pickup-groups")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class OrderPickupResource {
    @Inject OrderPickupService service;
    @GET
    public OrderPickupService.Plan faction(@PathParam("id") UUID id) { return service.get("faction", id); }
    @PATCH
    public OrderPickupService.Plan faction(@PathParam("id") UUID id, @NotNull @Valid OrderPickupService.Input input) { return service.save("faction", id, input); }
    @POST @Path("/notify")
    public int notifyFaction(@PathParam("id") UUID id) { return service.notify("faction", id); }
}
