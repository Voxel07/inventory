package org.ash.inventory.resource;

import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.ash.inventory.resource.dto.CountDtos;
import org.ash.inventory.service.CountService;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@Path("/api/inventory-counts")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CountResource {
    private final CountService service;

    public CountResource(CountService service) { this.service = service; }

    @GET
    public List<CountDtos.CountResponse> list(@QueryParam("status") String status,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.list(status, page, size);
    }
    @POST
    public Response create(@Valid CountDtos.CountInput input) {
        var created = service.create(input);
        return Response.created(URI.create("/api/inventory-counts/" + created.id())).entity(created).build();
    }
    @POST @Path("/{id}/start")
    public CountDtos.CountResponse start(@PathParam("id") UUID id, CountDtos.CountCommandInput input) {
        return service.start(id, input);
    }
    @POST @Path("/{id}/submit")
    public CountDtos.CountResponse submit(@PathParam("id") UUID id,
            @Valid CountDtos.CountSubmissionInput input) {
        return service.submit(id, input, false);
    }
    @POST @Path("/{id}/recount")
    public CountDtos.CountResponse recount(@PathParam("id") UUID id,
            @Valid CountDtos.CountSubmissionInput input) {
        return service.submit(id, input, true);
    }
    @POST @Path("/{id}/approve")
    public CountDtos.CountResponse approve(@PathParam("id") UUID id, CountDtos.CountCommandInput input) {
        return service.approve(id, input);
    }
    @POST @Path("/{id}/post")
    public CountDtos.CountResponse post(@PathParam("id") UUID id, CountDtos.CountCommandInput input) {
        return service.post(id, input);
    }
    @POST @Path("/{id}/cancel")
    public CountDtos.CountResponse cancel(@PathParam("id") UUID id, CountDtos.CountCommandInput input) {
        return service.cancel(id, input);
    }
}
