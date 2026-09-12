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
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.service.ApiQueryService;
import org.ash.inventory.service.InventoryOperationsService;
import org.ash.inventory.service.DomainEventService;
import org.ash.inventory.resource.dto.ApiResponses;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class OperationsResource {
    private final InventoryOperationsService service;
    private final ApiMapper mapper;
    private final ActorService actor;
    private final ApiQueryService queries;
    private final DomainEventService domainEvents;

    public OperationsResource(InventoryOperationsService service, ApiMapper mapper, ActorService actor,
            ApiQueryService queries, DomainEventService domainEvents) {
        this.service = service;
        this.mapper = mapper;
        this.actor = actor;
        this.queries = queries;
        this.domainEvents = domainEvents;
    }

    @GET
    @Path("/transactions")
    public List<ApiResponses.TransactionResponse> transactions(@QueryParam("itemId") UUID itemId, @QueryParam("userId") UUID userId,
            @QueryParam("transactionType") String type, @QueryParam("startDate") Instant start,
            @QueryParam("endDate") Instant end,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.transactions(itemId, userId, type, start, end, page, size);
    }

    @POST
    @Path("/transactions")
    @Transactional
    public ApiResponses.TransactionResponse transaction(@Valid ApiModels.TransactionInput input) {
        actor.requireWarehouse();
        return mapper.transaction(service.transact(input));
    }

    @GET
    @Path("/damage-reports")
    public List<ApiResponses.DamageResponse> damageReports(@QueryParam("itemId") UUID itemId,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.damageReports(itemId, page, size);
    }

    @POST
    @Path("/damage-reports")
    @Transactional
    public ApiResponses.DamageResponse createDamage(@Valid ApiModels.DamageInput input) {
        actor.requireMarshal();
        return mapper.damage(service.createDamage(input));
    }

    @PATCH
    @Path("/damage-reports/{id}")
    @Transactional
    public ApiResponses.DamageResponse resolveDamage(@PathParam("id") UUID id, @Valid ApiModels.DamageResolutionInput input) {
        actor.requireMaintenance();
        return mapper.damage(service.resolveDamage(id, input));
    }

    @GET
    @Path("/maintenance")
    public List<ApiResponses.MaintenanceResponse> maintenance(@QueryParam("itemId") UUID itemId,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.maintenance(itemId, page, size);
    }

    @POST
    @Path("/maintenance")
    @Transactional
    public ApiResponses.MaintenanceResponse maintenance(@Valid ApiModels.MaintenanceInput input) {
        actor.requireMaintenance();
        return mapper.maintenance(service.recordMaintenance(input));
    }

    @GET
    @Path("/procurement/deficits")
    public List<ApiResponses.DeficitResponse> deficits(@QueryParam("eventOccurrenceId") UUID eventOccurrenceId) {
        return queries.deficits(eventOccurrenceId);
    }

    @GET
    @Path("/outbox/status")
    public ApiResponses.OutboxStatusResponse outboxStatus() {
        actor.requireAdmin();
        var counts = new java.util.LinkedHashMap<String, Long>();
        domainEvents.statusCounts().forEach((status, count) -> counts.put(status.name(), count));
        return new ApiResponses.OutboxStatusResponse(counts);
    }

    @GET
    @Path("/outbox/dead-letters")
    public List<ApiResponses.OutboxEventResponse> deadLetters(
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        actor.requireAdmin();
        return domainEvents.deadLetters(page, size).stream().map(mapper::outboxEvent).toList();
    }

    @POST
    @Path("/outbox/dead-letters/{id}/retry")
    public ApiResponses.OutboxEventResponse retryDeadLetter(@PathParam("id") UUID id) {
        actor.requireAdmin();
        try {
            var event = domainEvents.retryDeadLetter(id);
            if (event == null) throw ApiException.notFound("Outbox event not found");
            return mapper.outboxEvent(event);
        } catch (IllegalStateException exception) {
            throw ApiException.conflict(exception.getMessage());
        }
    }
}
