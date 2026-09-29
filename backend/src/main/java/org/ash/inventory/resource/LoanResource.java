package org.ash.inventory.resource;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.LoanService;
import java.util.*;
@Path("/api/loans") @Produces(MediaType.APPLICATION_JSON) @Consumes(MediaType.APPLICATION_JSON)
public class LoanResource {
    @Inject LoanService service;
    @GET public List<LoanService.View> list() { return service.list(); }
    @POST public LoanService.View create(@Valid LoanService.Input input) { return service.create(input); }
    @POST @Path("/{id}/collect") public LoanService.View collect(@PathParam("id") UUID id, @Valid LoanService.Movement input) { return service.move(id, input, false); }
    @POST @Path("/{id}/return") public LoanService.View giveBack(@PathParam("id") UUID id, @Valid LoanService.Movement input) { return service.move(id, input, true); }
    @POST @Path("/{id}/extend") public LoanService.View extend(@PathParam("id") UUID id, @Valid LoanService.Extension input) { return service.extend(id, input); }
}
