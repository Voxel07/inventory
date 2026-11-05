package org.ash.inventory.operations.internal.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import jakarta.enterprise.context.control.ActivateRequestContext;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.operations.internal.model.CsvImportJob;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.persistence.CsvImportOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;
import java.util.HashSet;
import java.util.UUID;

@ApplicationScoped
public class CsvImportSteps {
    @Inject CsvImportOrm orm;
    @Inject ActorService actors;
    @Inject CsvImportRows rows;

    public static class RowFailure extends RuntimeException {
        final UUID job;
        final int cursor;
        final boolean forbidden;
        RowFailure(UUID job, int cursor, RuntimeException cause) {
            super(cause); this.job = job; this.cursor = cursor;
            this.forbidden = cause instanceof ApiException api && (api.status == 401 || api.status == 403);
        }
    }

    @ActivateRequestContext
    public boolean next() {
        record Attempt(UUID job, int cursor) {}
        var attempt = new java.util.concurrent.atomic.AtomicReference<Attempt>();
        try {
            return QuarkusTransaction.requiringNew().call(() -> {
                var job = orm.next();
                if (job == null) return false;
                attempt.set(new Attempt(job.id, job.cursor));
                var roles = new HashSet<DomainEnums.UserRole>();
                job.authorization.path("roles").forEach(role -> roles.add(DomainEnums.UserRole.valueOf(role.asText())));
                var factions = new java.util.ArrayList<String>();
                job.authorization.path("factions").forEach(faction -> factions.add(faction.asText()));
                actors.useBackgroundActor(job.requestedBy, job.authenticatedBy, job.accessRevision, roles, factions);
                job.context = job.context.deepCopy();
                job.result = job.result.deepCopy();
                rows.apply(job, job.work.get(job.cursor));
                advance(job);
                orm.flush();
                return true;
            });
        } catch (RuntimeException error) {
            if (attempt.get() == null) throw error;
            // Includes failures during commit, after the checkpoint's in-memory cursor already advanced.
            RuntimeException cause = error;
            for (Throwable nested = error; nested != null; nested = nested.getCause())
                if (nested instanceof ApiException api) { cause = api; break; }
            throw new RowFailure(attempt.get().job(), attempt.get().cursor(), cause);
        }
    }

    /** The failed command transaction has rolled back before its error is checkpointed. */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void failed(RowFailure failure) {
        var job = orm.lock(failure.job);
        if (job == null || job.cursor != failure.cursor || !java.util.Set.of("queued", "running").contains(job.status)) return;
        job.result = job.result.deepCopy();
        JsonNode step = job.work.get(job.cursor);
        String message = failure.getCause() instanceof ApiException ? failure.getCause().getMessage() : "Could not import this row";
        ((ArrayNode)job.result.path("errors")).add(step.path("kind").asText() + " (" + step.path("row").path("index").asText("reference") + "): " + message);
        if (!(failure.getCause() instanceof ApiException))
            org.jboss.logging.Logger.getLogger(CsvImportSteps.class).errorf(failure.getCause(), "CSV import %s row %d failed", job.id, job.cursor);
        if (failure.forbidden) job.status = "failed";
        else advance(job);
    }

    private void advance(CsvImportJob job) {
        if (job.work.get(job.cursor).path("counted").asBoolean()) job.processedRows++;
        job.cursor++;
        job.status = job.cursor == job.work.size() ? "completed" : "running";
    }
}
