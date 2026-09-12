package org.ash.inventory.resource;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.service.ApiQueryService;
import org.ash.inventory.service.OrderService;

import org.ash.inventory.resource.dto.ApiResponses;

import java.util.List;
import java.util.UUID;

@Path("/api/orders")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class OrderResource {
    private final OrderService service;
    private final ApiMapper mapper;
    private final ActorService actor;
    private final ApiQueryService queries;

    public OrderResource(OrderService service, ApiMapper mapper, ActorService actor, ApiQueryService queries) {
        this.service = service;
        this.mapper = mapper;
        this.actor = actor;
        this.queries = queries;
    }

    @GET
    public List<ApiResponses.OrderSummaryResponse> orders(@QueryParam("eventType") String eventType,
            @QueryParam("faction") String faction,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.orders(eventType, faction, page, size);
    }

    @GET
    @Path("/{id}")
    public ApiResponses.OrderResponse order(@PathParam("id") UUID id) {
        return queries.order(id);
    }

    @POST
    @Transactional
    public ApiResponses.OrderResponse create(@Valid ApiModels.OrderInput input) {
        actor.current();
        return mapper.order(service.create(input));
    }

    @PATCH
    @Path("/{id}")
    @Transactional
    public ApiResponses.OrderResponse update(@PathParam("id") UUID id, @Valid ApiModels.OrderInput input) {
        actor.current();
        return mapper.order(service.update(id, input));
    }

    @POST
    @Path("/{id}/prepare")
    @Transactional
    public ApiResponses.OrderResponse prepare(@PathParam("id") UUID id, @Valid ApiModels.PreparationInput input) {
        actor.requireWarehouse();
        return mapper.order(service.prepare(id, input));
    }

    @POST
    @Path("/{id}/transitions/{status}")
    @Transactional
    public ApiResponses.OrderResponse transition(@PathParam("id") UUID id, @PathParam("status") DomainEnums.OrderStatus status,
            ApiModels.TransitionInput input) {
        if (status == DomainEnums.OrderStatus.submitted || status == DomainEnums.OrderStatus.draft)
            actor.current();
        else if (status == DomainEnums.OrderStatus.picked_up || status == DomainEnums.OrderStatus.closed)
            actor.requireMarshal();
        else if (status == DomainEnums.OrderStatus.ready || status == DomainEnums.OrderStatus.preparing)
            actor.requireWarehouse();
        else
            actor.requirePlanner();
        var safeInput = input == null ? new ApiModels.TransitionInput(null, null, null, null, null, null) : input;
        return mapper.order(service.transition(id, status, safeInput));
    }

    @POST
    @Path("/{id}/return")
    @Transactional
    public ApiResponses.OrderResponse returnItems(@PathParam("id") UUID id, @Valid ApiModels.ReturnInput input) {
        actor.requireMarshal();
        return mapper.order(service.returnItems(id, input));
    }

    @POST
    @Path("/{id}/return-all")
    @Transactional
    public ApiResponses.OrderResponse returnAll(@PathParam("id") UUID id, ApiModels.TransitionInput input) {
        actor.requireMarshal();
        return mapper.order(service.returnAll(id, input == null ? null : input.idempotencyKey()));
    }
}
