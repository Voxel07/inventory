package org.ash.inventory.operations.internal.application;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.operations.internal.contract.dto.CsvImportDtos;
import org.ash.inventory.operations.internal.model.CsvImportJob;
import org.ash.inventory.operations.internal.persistence.CsvImportOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class CsvImportService {
    @Inject CsvImportOrm orm;
    @Inject ActorService actors;

    @Transactional
    public CsvImportDtos.Job upload(CsvImportDtos.Upload upload) {
        actors.requireInventoryCreation();
        var actor = actors.current();
        var existing = orm.byCommand(upload.commandId());
        if (existing != null) { requireOwner(existing); return view(existing); }
        try { ZoneId.of(upload.timezone()); }
        catch (java.time.DateTimeException invalid) { throw ApiException.badRequest("Invalid import timezone"); }
        var plan = CsvImportPlan.prepare(upload.plan());
        var job = new CsvImportJob();
        job.commandId = upload.commandId();
        job.filename = upload.filename();
        job.timezone = upload.timezone();
        job.requestedBy = actor.id;
        job.authenticatedBy = actors.authenticated().id;
        job.accessRevision = actor.accessRevision;
        job.authorization = JsonNodeFactory.instance.objectNode();
        var roles = job.authorization.putArray("roles");
        actor.roles.forEach(role -> roles.add(role.name()));
        var factions = job.authorization.putArray("factions");
        actor.factions.forEach(factions::add);
        job.work = plan.work();
        job.result = plan.result();
        job.totalRows = plan.rows();
        job.totalSteps = plan.work().size();
        job.context = JsonNodeFactory.instance.objectNode();
        job.context.put("autoCreateLocations", upload.plan().path("autoCreateLocations").asBoolean());
        orm.persist(job);
        return view(job);
    }

    @Transactional
    public List<CsvImportDtos.Job> recent() { return orm.recent(actors.current().id, actors.authenticated().id); }

    @Transactional
    public CsvImportDtos.Job get(UUID id) {
        var job = orm.find(id);
        requireOwner(job);
        return view(job);
    }

    private void requireOwner(CsvImportJob job) {
        if (job == null || !job.requestedBy.equals(actors.current().id) || !job.authenticatedBy.equals(actors.authenticated().id))
            throw ApiException.notFound("CSV import not found");
    }

    public static CsvImportDtos.Job view(CsvImportJob job) {
        return new CsvImportDtos.Job(job.id, job.filename, job.status,
                job.totalSteps == 0 ? 100 : (int)((long)job.cursor * 100 / job.totalSteps),
                job.totalRows, job.processedRows, job.result.deepCopy(), job.createdAt, job.updatedAt);
    }
}
