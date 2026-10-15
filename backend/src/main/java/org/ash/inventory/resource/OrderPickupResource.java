package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.OrderPickupService;
import java.util.UUID;

@Path("/api/orders/{kind}/{id}/pickup-groups")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class OrderPickupResource {
    @Inject OrderPickupService service;
    @GET
    public OrderPickupService.Plan get(@PathParam("kind") String kind, @PathParam("id") UUID id) { return service.get(kind, id); }
    @PATCH
    public OrderPickupService.Plan save(@PathParam("kind") String kind, @PathParam("id") UUID id, @NotNull @Valid OrderPickupService.Input input) { return service.save(kind, id, input); }
    @POST @Path("/notify")
    public int notify(@PathParam("kind") String kind, @PathParam("id") UUID id) { return service.notify(kind, id); }
}
