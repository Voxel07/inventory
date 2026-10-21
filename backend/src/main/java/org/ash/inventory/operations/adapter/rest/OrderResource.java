package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.ApiQueryService;
import org.ash.inventory.operations.internal.application.CustodyQueryService;
import org.ash.inventory.operations.internal.application.OrderPickupService;
import org.ash.inventory.operations.internal.application.OrderService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.contract.dto.CustodyDtos;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.security.ActorService;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
import java.util.List;
import java.util.UUID;

@Path("/api/orders/faction")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class OrderResource {
    private final OrderService service;
    private final ActorService actor;
    private final ApiQueryService queries;
    private final OrderPickupService pickups;
    private final CustodyQueryService custody;

    public OrderResource(OrderService service, ActorService actor, ApiQueryService queries,
            OrderPickupService pickups, CustodyQueryService custody) {
        this.service = service;
        this.actor = actor;
        this.queries = queries;
        this.pickups = pickups;
        this.custody = custody;
    }

    @Paged @GET
    public List<ApiResponses.OrderSummaryResponse> orders(@QueryParam("eventType") String eventType,
            @QueryParam("faction") String faction,
            @QueryParam("orderCode") String orderCode,
            @QueryParam("status") List<org.ash.inventory.operations.internal.model.DomainEnums.OrderStatus> statuses,
            @QueryParam("eventId") UUID eventId,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.orders(eventType, faction, orderCode, statuses, eventId, page, size);
    }

    @GET @Path("/previous")
    public ApiResponses.OrderResponse previous(@QueryParam("eventType") String eventType,
            @QueryParam("faction") String faction, @QueryParam("before") java.time.LocalDate before,
            @QueryParam("excludeId") UUID excludeId) {
        return queries.previousFactionOrder(eventType, faction, before, excludeId);
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
        return queries.projectOrder(service.create(input));
    }

    @PATCH
    @Path("/{id}")
    @Transactional
    public ApiResponses.OrderResponse update(@PathParam("id") UUID id, @Valid ApiModels.OrderInput input) {
        actor.current();
        queries.order(id);
        return queries.projectOrder(service.update(id, input));
    }

    @POST
    @Path("/{id}/prepare")
    @Transactional
    public ApiResponses.OrderResponse prepare(@PathParam("id") UUID id, @Valid ApiModels.PreparationInput input) {
        queries.order(id);
        return queries.projectOrder(service.prepare(id, input));
    }

    @POST
    @Path("/{id}/transitions/{status}")
    @Transactional
    public ApiResponses.OrderResponse transition(@PathParam("id") UUID id, @PathParam("status") DomainEnums.OrderStatus status,
            ApiModels.TransitionInput input) {
        queries.order(id);
        var safeInput = input == null ? new ApiModels.TransitionInput(null, null, null, null, null, null) : input;
        return queries.projectOrder(service.transition(id, status, safeInput));
    }

    @POST
    @Path("/{id}/return")
    @Transactional
    public ApiResponses.OrderResponse returnItems(@PathParam("id") UUID id, @Valid ApiModels.ReturnInput input) {
        queries.order(id);
        return queries.projectOrder(service.returnItems(id, input));
    }

    @POST
    @Path("/{id}/restock")
    @Transactional
    public ApiResponses.OrderResponse restock(@PathParam("id") UUID id, @Valid ApiModels.OrderRestockInput input) {
        queries.order(id);
        return queries.projectOrder(service.restockUnused(id, input));
    }

    @POST
    @Path("/{id}/return-all")
    @Transactional
    public ApiResponses.OrderResponse returnAll(@PathParam("id") UUID id, ApiModels.TransitionInput input) {
        queries.order(id);
        return queries.projectOrder(service.returnAll(id, input == null ? null : input.idempotencyKey()));
    }

    @GET
    @Path("/{id}/pickup-groups")
    public OrderPickupService.Plan pickupGroups(@PathParam("id") UUID id) {
        return pickups.get("faction", id);
    }

    @PATCH
    @Path("/{id}/pickup-groups")
    public OrderPickupService.Plan savePickupGroups(@PathParam("id") UUID id, @NotNull @Valid OrderPickupService.Input input) {
        return pickups.save("faction", id, input);
    }

    @POST
    @Path("/{id}/pickup-groups/notify")
    public int notifyPickupGroups(@PathParam("id") UUID id) {
        return pickups.notify("faction", id);
    }

    @Paged @GET
    @Path("/{id}/handovers")
    public List<CustodyDtos.HandoverResponse> handovers(@PathParam("id") UUID id,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return custody.handovers(InventoryOrder.Kind.faction, id, page, size);
    }

    @Paged @GET
    @Path("/{id}/reconciliations")
    public List<CustodyDtos.ReconciliationResponse> reconciliations(@PathParam("id") UUID id,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return custody.reconciliations(InventoryOrder.Kind.faction, id, page, size);
    }
}
