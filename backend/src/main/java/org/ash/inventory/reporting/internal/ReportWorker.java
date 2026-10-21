package org.ash.inventory.reporting.internal;

import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.runtime.WorkerRoles;
import org.ash.inventory.reporting.api.ReportPolicy;
import org.ash.inventory.reporting.api.ReportSource;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.control.ActivateRequestContext;
import jakarta.inject.Inject;
@ApplicationScoped
public class ReportWorker {
    @Inject WorkerRoles workers;
    @Inject ReportJobs jobs;
    @Inject ReportSource source;
    @Inject ReportPolicy policy;
    @Scheduled(every="5s", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    @ActivateRequestContext
    void rebuild(){
        if(!workers.enabled("reports"))return;
        runOne();
    }
    @ActivateRequestContext
    public void runOne(){
        var claim=jobs.claim();if(claim==null)return;
        try {
            try { policy.requireRead(claim.requestedBy()); }
            catch(ApiException denied){
                // Not a report failure: other readers must not inherit a request its requester may no longer make.
                if(denied.status==403){jobs.release(claim);return;}
                throw denied;
            }
            jobs.complete(claim,source.build(claim.name()));
        }
        catch(RuntimeException failure){
            jobs.failed(claim,failure instanceof ApiException problem && problem.status==413);
            org.jboss.logging.Logger.getLogger(ReportWorker.class).warnf("Report rebuild failed name=%s attempt=%d exception_type=%s",claim.name(),claim.attempt(),failure.getClass().getName());
        }
    }
}
