package org.ash.inventory.operations.internal.application;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.platform.runtime.WorkerRoles;

@ApplicationScoped
public class CsvImportWorker {
    @Inject WorkerRoles roles;
    @Inject CsvImportSteps steps;
    private static final org.jboss.logging.Logger LOG = org.jboss.logging.Logger.getLogger(CsvImportWorker.class);

    @Scheduled(every = "1s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void run() {
        if (!roles.enabled("imports")) return;
        // Each call owns one short transaction; large files never consume a single long-lived transaction.
        long until = System.nanoTime() + java.time.Duration.ofSeconds(2).toNanos();
        while (System.nanoTime() < until) {
            try { if (!steps.next()) return; }
            catch (CsvImportSteps.RowFailure failure) {
                try { steps.failed(failure); }
                catch (RuntimeException saveFailure) { LOG.error("Could not record CSV import failure; row will retry", saveFailure); return; }
            } catch (RuntimeException error) { LOG.error("CSV import worker failed; uncommitted work will retry", error); return; }
        }
    }
}
