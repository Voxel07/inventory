package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.LifecycleService;
import org.ash.inventory.operations.internal.contract.dto.LifecycleDtos;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;
import org.ash.inventory.operations.internal.model.RepairCase;

import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
/** Responses are mapped inside the command transaction: they read the damaged item through the repair. */
@jakarta.transaction.Transactional
public class LifecycleResource {
    private final LifecycleService service;

    public LifecycleResource(LifecycleService service) {
        this.service = service;
    }

    @Paged @GET
    @Path("/maintenance-schedules")
    public List<LifecycleDtos.ScheduleResponse> schedules(
            @QueryParam("itemId") UUID itemId,
            @QueryParam("assetInstanceId") UUID assetId,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.schedules(itemId, assetId, page, size).stream().map(this::schedule).toList();
    }

    @POST
    @Path("/maintenance-schedules")
    public Response createSchedule(@Valid LifecycleDtos.ScheduleInput input) {
        var created = service.createSchedule(input);
        return Response.created(java.net.URI.create("/api/maintenance-schedules/" + created.id))
                .entity(schedule(created)).build();
    }

    @PUT
    @Path("/maintenance-schedules/{id}")
    public LifecycleDtos.ScheduleResponse updateSchedule(@PathParam("id") UUID id,
            @Valid LifecycleDtos.ScheduleInput input) {
        return schedule(service.updateSchedule(id, input));
    }

    @DELETE
    @Path("/maintenance-schedules/{id}")
    public Response retireSchedule(@PathParam("id") UUID id) {
        service.retireSchedule(id);
        return Response.noContent().build();
    }

    @Paged @GET
    @Path("/repairs")
    public List<LifecycleDtos.RepairResponse> repairs(
            @QueryParam("status") String status,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.repairs(status, page, size).stream().map(this::repair).toList();
    }

    @POST
    @Path("/repairs")
    public Response createRepair(@Valid LifecycleDtos.RepairInput input) {
        var created = service.createRepair(input);
        return Response.created(java.net.URI.create("/api/repairs/" + created.id))
                .entity(repair(created)).build();
    }

    @POST
    @Path("/repairs/{id}/transitions")
    public LifecycleDtos.RepairResponse transitionRepair(@PathParam("id") UUID id,
            @Valid LifecycleDtos.RepairTransitionInput input) {
        return repair(service.transitionRepair(id, input));
    }

    private LifecycleDtos.ScheduleResponse schedule(MaintenanceSchedule value) {
        return new LifecycleDtos.ScheduleResponse(value.id, value.item.id, value.item.name, value.item.sku,
                value.assetInstance == null ? null : value.assetInstance.id,
                value.assetInstance == null ? null : value.assetInstance.assetCode,
                value.maintenanceType.name(), value.intervalType.name(), value.intervalValue,
                value.nextDueAt, value.nextDueValue, value.warningWindow,
                value.responsiblePerson == null ? null : value.responsiblePerson.id,
                value.requiredChecklist, value.checkoutBlocking, value.active);
    }

    private LifecycleDtos.RepairResponse repair(RepairCase value) {
        var report = value.damageReport;
        return new LifecycleDtos.RepairResponse(value.id, report.id,
                report.item == null ? null : report.item.id, report.item == null ? null : report.item.name,
                report.assembly == null ? null : report.assembly.name,
                value.assetInstance == null ? null : value.assetInstance.assetCode, report.description,
                value.assetInstance == null ? null : value.assetInstance.id,
                value.handover == null ? null : value.handover.id, value.status.name(),
                value.repairOwner == null ? null : value.repairOwner.id,
                value.repairVendor == null ? null : value.repairVendor.id,
                value.safetyImpact, value.partsAndCostNotes, value.startedAt, value.completedAt,
                value.verificationResult, value.approvedBy == null ? null : value.approvedBy.id,
                value.notes, value.createdAt, value.updatedAt);
    }
}
