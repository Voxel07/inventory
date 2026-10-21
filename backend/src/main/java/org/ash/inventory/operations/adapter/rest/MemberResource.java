package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.CustodyBalanceService;
import org.ash.inventory.operations.internal.application.MemberService;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.*;

@Path("/api/member") @Produces(MediaType.APPLICATION_JSON) @Consumes(MediaType.APPLICATION_JSON)
public class MemberResource {
    @Inject MemberService service;
    @GET @Path("/custody") public List<org.ash.inventory.operations.internal.application.CustodyBalanceService.Balance> custody() { return service.custodyRows(); }
    @GET @Path("/storage") public List<MemberService.Stored> stored() { return service.stored(); }
    @GET @Path("/assignments") public List<MemberService.LocationView> assignments() { return service.assignments(); }
    @PUT @Path("/assignments/{id}") public void assign(@PathParam("id") UUID id, @Valid MemberService.Assignment input) { service.assign(id, input); }
    @Paged @GET @Path("/requests") public List<MemberService.RequestView> requests(@QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) { return service.requests(page, size); }
    @POST @Path("/requests") public MemberService.RequestView request(@Valid MemberService.RequestInput input) { return service.request(input); }
    @POST @Path("/requests/{id}") public MemberService.RequestView decide(@PathParam("id") UUID id, @Valid MemberService.Decision input) { return service.decide(id, input); }
    @POST @Path("/returns") public Map<String, UUID> submitReturn(@Valid MemberService.ReturnInput input) { return Map.of("id", service.submitReturn(input)); }
}
