package org.ash.inventory.reporting.internal;

import org.ash.inventory.reporting.api.ReportApi;
import org.ash.inventory.reporting.api.ReportSource;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.*;

/** Shared, leased jobs. Lease fencing and generation replacement commit together. */
@ApplicationScoped
public class ReportJobs {
    @Inject EntityManager em;
    public record Claim(String name,UUID lease,UUID requestedBy,int attempt) {}

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public ReportApi.Job enqueue(String name,UUID requestedBy,boolean force){
        em.createNativeQuery("""
            insert into report_rebuild_jobs(name,status,requested_by,requested_at,available_at,attempts)
            values(:name,'pending',:actor,now(),now(),0)
            on conflict(name) do update set status='pending',requested_by=excluded.requested_by,
              requested_at=now(),available_at=now(),attempts=0,last_error=null,lease=null,lease_until=null
            where report_rebuild_jobs.status='completed' or (:force and report_rebuild_jobs.status='failed')
            """).setParameter("name",name).setParameter("actor",requestedBy).setParameter("force",force).executeUpdate();
        return status(name);
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Claim claim(){
        var rows=em.createNativeQuery("""
            select name,requested_by,attempts from report_rebuild_jobs
            where status in ('pending','retry','running') and available_at<=now()
              and (lease_until is null or lease_until<now())
            order by requested_at,name for update skip locked limit 1
            """).getResultList();
        if(rows.isEmpty())return null;
        var row=(Object[])rows.getFirst();String name=row[0].toString();int attempt=((Number)row[2]).intValue()+1;
        if(attempt>8){em.createNativeQuery("update report_rebuild_jobs set status='failed',last_error='Report attempts exhausted',lease=null,lease_until=null where name=:name").setParameter("name",name).executeUpdate();return null;}
        var lease=UUID.randomUUID();
        em.createNativeQuery("update report_rebuild_jobs set status='running',attempts=:attempt,lease=:lease,lease_until=now()+interval '10 minutes' where name=:name")
            .setParameter("attempt",attempt).setParameter("lease",lease).setParameter("name",name).executeUpdate();
        return new Claim(name,lease,(UUID)row[1],attempt);
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void complete(Claim claim,ReportSource.Snapshot snapshot){
        if(!owns(claim))return;
        var report=em.find(OperationalReport.class,claim.name());
        if(report==null){report=new OperationalReport();report.name=claim.name();em.persist(report);}
        report.rows=new ArrayList<>(snapshot.rows());report.sourceToken=snapshot.sourceToken();report.startedAt=snapshot.startedAt();report.generatedAt=snapshot.generatedAt();
        em.createNativeQuery("update report_rebuild_jobs set status='completed',lease=null,lease_until=null,last_error=null where name=:name")
            .setParameter("name",claim.name()).executeUpdate();
    }

    /** Drops a request whose requester lost access; the next authorized stale read queues a fresh one. */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void release(Claim claim){
        if(!owns(claim))return;
        em.createNativeQuery("delete from report_rebuild_jobs where name=:name").setParameter("name",claim.name()).executeUpdate();
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void failed(Claim claim,boolean permanent){
        if(!owns(claim))return;
        em.createNativeQuery("update report_rebuild_jobs set status=:status,available_at=now()+make_interval(secs=>:delay),last_error=:error,lease=null,lease_until=null where name=:name")
            .setParameter("status",permanent || claim.attempt()>=8?"failed":"retry")
            .setParameter("delay",Math.min(300,1<<Math.min(8,claim.attempt())))
            .setParameter("error",permanent?"Report source exceeds its configured row budget":"Report rebuild failed; retry scheduled")
            .setParameter("name",claim.name()).executeUpdate();
    }
    @Transactional public ReportApi.Job status(String name){
        var rows=em.createNativeQuery("select status,attempts,requested_at,last_error from report_rebuild_jobs where name=:name").setParameter("name",name).getResultList();
        if(rows.isEmpty())return new ReportApi.Job("idle",0,null,null);
        var row=(Object[])rows.getFirst();return new ReportApi.Job(row[0].toString(),((Number)row[1]).intValue(),instant(row[2]),(String)row[3]);
    }
    private Instant instant(Object value){return value instanceof Instant i?i:((java.time.OffsetDateTime)value).toInstant();}
    private boolean owns(Claim claim){return !em.createNativeQuery("select 1 from report_rebuild_jobs where name=:name and lease=:lease and status='running' for update")
            .setParameter("name",claim.name()).setParameter("lease",claim.lease()).getResultList().isEmpty();}
}
