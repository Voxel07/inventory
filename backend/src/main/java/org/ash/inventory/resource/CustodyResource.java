package org.ash.inventory.resource;

import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.resource.dto.CustodyDtos;
import org.ash.inventory.service.CustodyQueryService;

import java.util.List;
import java.util.UUID;

@Path("/api/orders/{orderId}")
@Produces(MediaType.APPLICATION_JSON)
public class CustodyResource {
    private final CustodyQueryService service;

    public CustodyResource(CustodyQueryService service) {
        this.service = service;
    }

    @GET
    @Path("/handovers")
    public List<CustodyDtos.HandoverResponse> handovers(@PathParam("orderId") UUID orderId,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.handovers(orderId, page, size);
    }

    @GET
    @Path("/reconciliations")
    public List<CustodyDtos.ReconciliationResponse> reconciliations(@PathParam("orderId") UUID orderId,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.reconciliations(orderId, page, size);
    }
}
