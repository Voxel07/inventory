package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.OrderPickupService;
import java.util.UUID;

@Path("/api/general-orders/{id}/pickup-groups")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class GeneralOrderPickupResource {
    @Inject OrderPickupService service;
    @GET public OrderPickupService.Plan get(@PathParam("id") UUID id) { return service.get("general", id); }
    @PATCH public OrderPickupService.Plan save(@PathParam("id") UUID id, @NotNull @Valid OrderPickupService.Input input) { return service.save("general", id, input); }
    @POST @Path("/notify") public int notify(@PathParam("id") UUID id) { return service.notify("general", id); }
}
