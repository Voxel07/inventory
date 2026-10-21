package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.InventoryAccessService;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.*;

@Path("/api/access") @Produces(MediaType.APPLICATION_JSON) @Consumes(MediaType.APPLICATION_JSON)
public class InventoryAccessResource {
    @Inject InventoryAccessService service;
    @GET @Path("/people") public List<InventoryAccessService.Person> people() { return service.people(); }
    @GET @Path("/groups") public List<InventoryAccessService.Group> groups() { return service.groups(); }
    @POST @Path("/groups") public InventoryAccessService.Group create(@Valid InventoryAccessService.GroupInput input) { return service.saveGroup(null, input); }
    @PATCH @Path("/groups/{id}") public InventoryAccessService.Group group(@PathParam("id") UUID id, @Valid InventoryAccessService.GroupInput input) { return service.saveGroup(id, input); }
    /** Removes the group and its shares; the body carries the revision and the audit reason. */
    @POST @Path("/groups/{id}/delete") public jakarta.ws.rs.core.Response deleteGroup(@PathParam("id") UUID id, @Valid InventoryAccessService.GroupDeletion input) {
        service.deleteGroup(id, input); return jakarta.ws.rs.core.Response.noContent().build();
    }
    @GET @Path("/{kind:items|storage-locations|assemblies}/{id}") public InventoryAccessService.View get(@PathParam("kind") String kind, @PathParam("id") UUID id) { return service.get(kind, id); }
    @PUT @Path("/{kind:items|storage-locations|assemblies}/{id}") public InventoryAccessService.View update(@PathParam("kind") String kind, @PathParam("id") UUID id, @Valid InventoryAccessService.Input input) { return service.update(kind, id, input); }
}
