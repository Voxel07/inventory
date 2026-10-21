package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.OrderPickupService;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.UUID;

@Path("/api/items/{id}/responsibility")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class ItemResponsibilityResource {
    @Inject OrderPickupService service;
    @GET public OrderPickupService.Responsibility get(@PathParam("id") UUID id) { return service.responsibility(id); }
    @PATCH public OrderPickupService.Responsibility save(@PathParam("id") UUID id, @NotNull @Valid OrderPickupService.ResponsibilityInput input) { return service.setResponsibility(id, input); }
}
