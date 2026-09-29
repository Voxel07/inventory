package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.EquipmentService;
import java.util.UUID;

@Path("/api/items/{itemId}/equipment")
@Produces(MediaType.APPLICATION_JSON) @Consumes(MediaType.APPLICATION_JSON)
public class EquipmentResource {
    @Inject EquipmentService service;
    @GET public EquipmentService.Profile get(@PathParam("itemId") UUID itemId) { return service.get(itemId); }
    @PUT public EquipmentService.Profile update(@PathParam("itemId") UUID itemId, @Valid EquipmentService.ProfileInput input) { return service.update(itemId, input); }
    @POST @Path("/commitments") public EquipmentService.Profile commit(@PathParam("itemId") UUID itemId, @Valid EquipmentService.CommitmentInput input) { return service.commit(itemId, input); }
    @POST @Path("/commitments/{id}/cancel") public EquipmentService.Profile cancel(@PathParam("itemId") UUID itemId, @PathParam("id") UUID id, @Valid EquipmentService.CancelInput input) { return service.cancel(itemId, id, input); }
}
