package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.UUID;
import org.ash.inventory.service.AccountLifecycleService;

@Path("/api/users/{id}/lifecycle") @Produces(MediaType.APPLICATION_JSON) @Consumes(MediaType.APPLICATION_JSON)
public class AccountLifecycleResource {
    @Inject AccountLifecycleService service;
    @GET public AccountLifecycleService.Overview overview(@PathParam("id") UUID id) { return service.overview(id); }
    @PATCH public void status(@PathParam("id") UUID id, @Valid AccountLifecycleService.StatusInput input) { service.status(id, input); }
    @POST @Path("/transfer") public AccountLifecycleService.TransferResult transfer(@PathParam("id") UUID id, @Valid AccountLifecycleService.TransferInput input) { return service.transfer(id, input); }
}
