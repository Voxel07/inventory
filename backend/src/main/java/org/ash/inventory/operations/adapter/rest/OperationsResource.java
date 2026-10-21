package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.application.ApiQueryService;
import org.ash.inventory.operations.internal.application.CustodyBalanceService;
import org.ash.inventory.operations.internal.application.InventoryOperationsService;
import org.ash.inventory.operations.internal.application.PlanningService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.projection.ApiMapper;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

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
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.PlanningService planning;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.CustodyBalanceService custody;

    @GET @Path("/custody-balances")
    public List<org.ash.inventory.operations.internal.application.CustodyBalanceService.Balance> custodyBalances(@QueryParam("mine") boolean mine) {
        return custody.list(mine);
    }

    @POST @Path("/procurement/overrides")
    public jakarta.ws.rs.core.Response planningOverride(org.ash.inventory.operations.internal.application.PlanningService.OverrideInput input) {
        planning.override(input);
        return jakarta.ws.rs.core.Response.noContent().build();
    }

    public OperationsResource(InventoryOperationsService service, ApiMapper mapper, ActorService actor,
            ApiQueryService queries, DomainEventService domainEvents) {
        this.service = service;
        this.mapper = mapper;
        this.actor = actor;
        this.queries = queries;
        this.domainEvents = domainEvents;
    }

    @Paged @GET
    @Path("/transactions")
    public List<ApiResponses.TransactionResponse> transactions(@QueryParam("itemId") UUID itemId,
            @QueryParam("assetInstanceId") UUID assetInstanceId, @QueryParam("userId") UUID userId,
            @QueryParam("transactionType") String type, @QueryParam("startDate") Instant start,
            @QueryParam("endDate") Instant end, @QueryParam("search") String search,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.transactions(itemId, assetInstanceId, userId, type, start, end, search, page, size);
    }

    @POST @Path("/transactions/batch") @Transactional
    public List<ApiResponses.TransactionResponse> transactionBatch(List<ApiModels.@Valid TransactionInput> inputs) {
        return service.transactBatch(inputs).stream().map(mapper::transaction).toList();
    }

    @POST
    @Path("/transactions")
    @Transactional
    public ApiResponses.TransactionResponse transaction(@Valid ApiModels.TransactionInput input) {
        return mapper.transaction(service.transact(input));
    }

    @POST
    @Path("/transactions/{id}/restock")
    @Transactional
    public ApiResponses.TransactionResponse restock(@jakarta.ws.rs.PathParam("id") UUID id, @Valid ApiModels.RestockInput input) {
        return mapper.transaction(service.restockUnused(id, input));
    }

    @GET
    @Path("/transactions/restockable")
    public List<ApiModels.RestockableCheckout> restockable(@QueryParam("itemId") UUID itemId) {
        if (itemId == null) throw org.ash.inventory.platform.api.ApiException.badRequest("itemId is required");
        return service.restockable(itemId);
    }

    @Paged @GET
    @Path("/damage-reports")
    public List<ApiResponses.DamageResponse> damageReports(@QueryParam("itemId") UUID itemId,
            @QueryParam("search") String search,
            @QueryParam("assetInstanceId") UUID assetInstanceId, @QueryParam("assemblyId") UUID assemblyId,
            @QueryParam("status") List<org.ash.inventory.operations.internal.model.DomainEnums.DamageStatus> statuses,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.damageReports(itemId, assetInstanceId, assemblyId, statuses, search, page, size);
    }

    @POST
    @Path("/damage-reports")
    @Transactional
    public ApiResponses.DamageResponse createDamage(@Valid ApiModels.DamageInput input) {
        return mapper.damage(service.reportDamage(input));
    }

    @PATCH
    @Path("/damage-reports/{id}")
    @Transactional
    public ApiResponses.DamageResponse resolveDamage(@PathParam("id") UUID id, @Valid ApiModels.DamageResolutionInput input) {
        return mapper.damage(service.resolveDamageReport(id, input));
    }

    @Paged @GET
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

    @Paged @GET
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
