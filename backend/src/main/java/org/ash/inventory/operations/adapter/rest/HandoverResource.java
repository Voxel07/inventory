package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.HandoverEvidenceService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.*;
@Path("/api/handovers") @Consumes(MediaType.APPLICATION_JSON) @Produces(MediaType.APPLICATION_JSON)
public class HandoverResource {
    @Inject HandoverEvidenceService service;
    @GET @Paged public List<HandoverEvidenceService.Handover> list(@QueryParam("orderId") UUID orderId,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        if (orderId == null) throw ApiException.badRequest("orderId is required"); return service.list(orderId, page, size);
    }
    @POST @Path("/{id}/evidence") public HandoverEvidenceService.Evidence record(@PathParam("id") UUID id, @Valid HandoverEvidenceService.Input input) { return service.record(id, input); }
}
