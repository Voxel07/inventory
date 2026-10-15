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

    public GeneralOrderResource(ActorService actors, OrderService service,
            ApiQueryService queries) {
        this.actors = actors;
        this.service = service;
        this.queries = queries;
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
}
