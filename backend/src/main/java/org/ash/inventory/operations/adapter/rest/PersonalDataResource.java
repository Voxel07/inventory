package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.PersonalDataService;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import java.util.UUID;
@Path("/api/users/{id}/personal-data")
public class PersonalDataResource {
    @Inject PersonalDataService service;
    @GET @Path("/export") @Produces("application/zip") public Response export(@PathParam("id") UUID id) {
        return Response.ok(service.export(id)).header("Content-Disposition","attachment; filename=\"inventory-person-"+id+".zip\"").header("Cache-Control","no-store").build();
    }
    @POST @Path("/pseudonymize") @Consumes(MediaType.APPLICATION_JSON) public void erase(@PathParam("id") UUID id,@Valid PersonalDataService.EraseInput input) {service.erase(id,input);}
}
