package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.ActionInboxService;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
@Path("/api/action-inbox") @Produces(MediaType.APPLICATION_JSON) @Consumes(MediaType.APPLICATION_JSON)
public class ActionInboxResource {
    @Inject ActionInboxService service;
    @GET public List<ActionInboxService.Action> list() { return service.list(); }
    @PUT @Path("/reminder") public void remind(@Valid ActionInboxService.ReminderInput input) { service.remind(input); }
}
