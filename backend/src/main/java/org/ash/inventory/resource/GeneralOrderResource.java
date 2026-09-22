package org.ash.inventory.resource;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.ApiQueryService;
import org.ash.inventory.service.GeneralOrderService;

import java.util.List;
import java.util.UUID;

@Path("/api/general-orders")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class GeneralOrderResource {
    private final ActorService actors;
    private final GeneralOrderService service;
    private final ApiMapper mapper;
    private final ApiQueryService queries;

    public GeneralOrderResource(ActorService actors, GeneralOrderService service, ApiMapper mapper,
            ApiQueryService queries) {
        this.actors = actors;
        this.service = service;
        this.mapper = mapper;
        this.queries = queries;
    }

    @GET
    public List<ApiResponses.GeneralOrderResponse> orders(
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.generalOrders(page, size);
    }

    @POST
    @Transactional
    public ApiResponses.GeneralOrderResponse create(@Valid ApiModels.GeneralOrderInput input) {
        actors.current();
        return mapper.generalOrder(service.create(input));
    }

    @PATCH
    @Path("/{id}")
    @Transactional
    public ApiResponses.GeneralOrderResponse update(@PathParam("id") UUID id, @Valid ApiModels.GeneralOrderInput input) {
        return mapper.generalOrder(service.update(id, input));
    }

    @POST
    @Path("/{id}/{action}")
    @Transactional
    public ApiResponses.GeneralOrderResponse transition(@PathParam("id") UUID id, @PathParam("action") String action,
            ApiModels.GeneralOrderPickupInput input) {
        return mapper.generalOrder(service.transition(id, action, input));
    }

    @POST
    @Path("/{id}/return")
    @Transactional
    public ApiResponses.GeneralOrderResponse returnItems(@PathParam("id") UUID id, ApiModels.GeneralOrderReturnInput input) {
        return mapper.generalOrder(service.returnItems(id, input));
    }
}
