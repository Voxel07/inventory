package org.ash.inventory.resource;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
import org.ash.inventory.model.InventoryOrder;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.resource.dto.CustodyDtos;
import org.ash.inventory.service.ApiQueryService;
import org.ash.inventory.service.CustodyQueryService;
import org.ash.inventory.service.OrderPickupService;
import org.ash.inventory.service.OrderService;

import java.util.List;
import java.util.UUID;

@Path("/api/orders/general")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class GeneralOrderResource {
    private final ActorService actors;
    private final OrderService service;
    private final ApiQueryService queries;
    private final OrderPickupService pickups;
    private final CustodyQueryService custody;

    public GeneralOrderResource(ActorService actors, OrderService service,
            ApiQueryService queries, OrderPickupService pickups, CustodyQueryService custody) {
        this.actors = actors;
        this.service = service;
        this.queries = queries;
        this.pickups = pickups;
        this.custody = custody;
    }

    @Paged @GET
    public List<ApiResponses.GeneralOrderSummaryResponse> orders(
            @QueryParam("status") List<org.ash.inventory.model.DomainEnums.OrderStatus> statuses,
            @QueryParam("eventId") UUID eventId,
            @QueryParam("eventType") String eventType,
            @QueryParam("search") String search,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.generalOrders(new org.ash.inventory.orm.OrderOrm.Filter(statuses, eventId, eventType, search), page, size);
    }

    @GET
    @Path("/{id}")
    public ApiResponses.GeneralOrderResponse order(@PathParam("id") UUID id) {
        return queries.generalOrder(id);
    }

    @POST
    @Transactional
    public ApiResponses.GeneralOrderResponse create(@Valid ApiModels.GeneralOrderInput input) {
        actors.current();
        return queries.projectGeneralOrder(service.createGeneral(input));
    }

    @PATCH
    @Path("/{id}")
    @Transactional
    public ApiResponses.GeneralOrderResponse update(@PathParam("id") UUID id, @Valid ApiModels.GeneralOrderInput input) {
        queries.generalOrder(id);
        return queries.projectGeneralOrder(service.updateGeneral(id, input));
    }

    @POST
    @Path("/{id}/transitions/{status}")
    @Transactional
    public ApiResponses.GeneralOrderResponse transition(@PathParam("id") UUID id, @PathParam("status") org.ash.inventory.model.DomainEnums.OrderStatus status,
            ApiModels.TransitionInput input) {
        queries.generalOrder(id);
        var safe = input == null ? new ApiModels.TransitionInput(null, null, null, null, null, null) : input;
        return queries.projectGeneralOrder(service.transition(id, status, safe));
    }

    @POST @Path("/{id}/prepare") @Transactional
    public ApiResponses.GeneralOrderResponse prepare(@PathParam("id") UUID id, @Valid ApiModels.PreparationInput input) {
        queries.generalOrder(id);
        return queries.projectGeneralOrder(service.prepare(id, input));
    }

    @POST
    @Path("/{id}/return")
    @Transactional
    public ApiResponses.GeneralOrderResponse returnItems(@PathParam("id") UUID id, @Valid ApiModels.ReturnInput input) {
        queries.generalOrder(id);
        return queries.projectGeneralOrder(service.returnItems(id, input));
    }

    @GET
    @Path("/{id}/pickup-groups")
    public OrderPickupService.Plan pickupGroups(@PathParam("id") UUID id) {
        return pickups.get("general", id);
    }

    @PATCH
    @Path("/{id}/pickup-groups")
    public OrderPickupService.Plan savePickupGroups(@PathParam("id") UUID id, @NotNull @Valid OrderPickupService.Input input) {
        return pickups.save("general", id, input);
    }

    @POST
    @Path("/{id}/pickup-groups/notify")
    public int notifyPickupGroups(@PathParam("id") UUID id) {
        return pickups.notify("general", id);
    }

    @Paged @GET
    @Path("/{id}/handovers")
    public List<CustodyDtos.HandoverResponse> handovers(@PathParam("id") UUID id,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return custody.handovers(InventoryOrder.Kind.general, id, page, size);
    }

    @Paged @GET
    @Path("/{id}/reconciliations")
    public List<CustodyDtos.ReconciliationResponse> reconciliations(@PathParam("id") UUID id,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return custody.reconciliations(InventoryOrder.Kind.general, id, page, size);
    }
}
