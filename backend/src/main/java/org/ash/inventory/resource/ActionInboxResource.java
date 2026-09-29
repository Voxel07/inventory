package org.ash.inventory.resource;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.ActionInboxService;
import java.util.List;
@Path("/api/action-inbox") @Produces(MediaType.APPLICATION_JSON) @Consumes(MediaType.APPLICATION_JSON)
public class ActionInboxResource {
    @Inject ActionInboxService service;
    @GET public List<ActionInboxService.Action> list() { return service.list(); }
    @PUT @Path("/reminder") public void remind(@Valid ActionInboxService.ReminderInput input) { service.remind(input); }
}
