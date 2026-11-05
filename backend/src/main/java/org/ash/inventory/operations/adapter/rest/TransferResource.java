package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.TransferService;
import org.ash.inventory.operations.internal.contract.dto.TransferDtos;

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
import java.net.URI;
import java.util.List;
import java.util.UUID;

@Path("/api/transfers")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class TransferResource {
    private final TransferService service;

    public TransferResource(TransferService service) { this.service = service; }

    @Paged @GET
    public List<TransferDtos.TransferResponse> list(@QueryParam("status") @org.ash.inventory.platform.api.InputText String status,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.list(status, page, size);
    }

    @POST
    public Response create(@jakarta.validation.constraints.NotNull @Valid TransferDtos.TransferInput input) {
        var created = service.create(input);
        return Response.created(URI.create("/api/transfers/" + created.id())).entity(created).build();
    }

    @POST @Path("/{id}/dispatch")
    public TransferDtos.TransferResponse dispatch(@PathParam("id") UUID id,
            @jakarta.validation.constraints.NotNull @Valid TransferDtos.CommandInput input) {
        return service.dispatch(id, input);
    }

    @POST @Path("/{id}/receive")
    public TransferDtos.TransferResponse receive(@PathParam("id") UUID id,
            @jakarta.validation.constraints.NotNull @Valid TransferDtos.ReceiveInput input) {
        return service.receive(id, input);
    }

    @POST @Path("/{id}/cancel")
    public TransferDtos.TransferResponse cancel(@PathParam("id") UUID id,
            @jakarta.validation.constraints.NotNull @Valid TransferDtos.CommandInput input) {
        return service.cancel(id, input);
    }
}
