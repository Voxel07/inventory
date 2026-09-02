package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.OperationsOrm;
import org.ash.inventory.service.InventoryOperationsService;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class OperationsResource {
    @Inject InventoryOperationsService service;
    @Inject ApiMapper mapper;
    @Inject ActorService actor;
    @Inject OperationsOrm orm;

    @GET @Path("/transactions") @Transactional
    public List<?> transactions(@QueryParam("itemId") UUID itemId, @QueryParam("userId") UUID userId,
                                @QueryParam("transactionType") String type, @QueryParam("startDate") Instant start,
                                @QueryParam("endDate") Instant end) {
        actor.current();
        return orm.transactions(itemId, userId, type, start, end).stream().map(mapper::transaction).toList();
    }

    @POST @Path("/transactions") public Object transaction(@Valid ApiModels.TransactionInput input) { actor.requireManager(); return mapper.transaction(service.transact(input)); }

    @GET @Path("/damage-reports") @Transactional
    public List<?> damageReports(@QueryParam("itemId") UUID itemId) {
        actor.current();
        List<DamageReport> reports = orm.damageReports(itemId);
        return reports.stream().map(mapper::damage).toList();
    }
    @POST @Path("/damage-reports") public Object createDamage(@Valid ApiModels.DamageInput input) { actor.requireManager(); return mapper.damage(service.createDamage(input)); }
    @PATCH @Path("/damage-reports/{id}") public Object resolveDamage(@PathParam("id") UUID id, @Valid ApiModels.DamageResolutionInput input) { actor.requireManager(); return mapper.damage(service.resolveDamage(id, input)); }

    @GET @Path("/maintenance") @Transactional
    public List<?> maintenance(@QueryParam("itemId") UUID itemId) {
        actor.current();
        List<MaintenanceRecord> records = orm.maintenanceRecords(itemId);
        return records.stream().map(mapper::maintenance).toList();
    }
    @POST @Path("/maintenance") public Object maintenance(@Valid ApiModels.MaintenanceInput input) { actor.requireManager(); return mapper.maintenance(service.recordMaintenance(input)); }

    @GET @Path("/procurement/deficits") public Object deficits(@QueryParam("eventOccurrenceId") UUID eventOccurrenceId) { actor.current(); return service.deficits(eventOccurrenceId); }
}
