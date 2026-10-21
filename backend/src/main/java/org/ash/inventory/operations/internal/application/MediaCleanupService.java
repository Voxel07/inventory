package org.ash.inventory.operations.internal.application;

import org.ash.inventory.blobs.api.BlobStore;
import org.ash.inventory.platform.runtime.WorkerRoles;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.UUID;

/** Durable reconciliation of object operations across database commit, rollback, and process failure. */
@ApplicationScoped
public class MediaCleanupService {
    @Inject EntityManager em;
    @Inject BlobStore blobs;
    @Inject WorkerRoles workers;
    public record Claim(String key, UUID lease) {}

    /** Commit this intent before copying: even a crash before the resource transaction commits leaves cleanup work. */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void protectDestination(String key) {
        em.createNativeQuery("insert into media_cleanup_jobs(object_key,available_at) values(:key,now()+interval '1 hour') on conflict(object_key) do nothing")
                .setParameter("key",key).executeUpdate();
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public void retain(String key) { em.createNativeQuery("delete from media_cleanup_jobs where object_key=:key").setParameter("key",key).executeUpdate(); }

    @Transactional(Transactional.TxType.MANDATORY)
    public void attached(String source,String destination) {
        em.createNativeQuery("delete from media_cleanup_jobs where object_key=:key").setParameter("key",destination).executeUpdate();
        deleteAfterCommit(source);
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public void deleteAfterCommit(String key) {
        em.createNativeQuery("insert into media_cleanup_jobs(object_key,available_at) values(:key,now()) on conflict(object_key) do update set available_at=least(media_cleanup_jobs.available_at,excluded.available_at)")
                .setParameter("key",key).executeUpdate();
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Claim claim() {
        var keys=em.createNativeQuery("""
            select j.object_key from media_cleanup_jobs j where j.available_at<=now()
              and (j.lease_until is null or j.lease_until<now())
              and not exists(select 1 from inventory_media_objects m where m.object_key=j.object_key)
            order by j.available_at,j.object_key for update of j skip locked limit 1
            """).getResultList();
        if(keys.isEmpty())return null;
        String key=keys.getFirst().toString();var lease=UUID.randomUUID();
        em.createNativeQuery("update media_cleanup_jobs set lease=:lease,lease_until=now()+interval '5 minutes' where object_key=:key")
                .setParameter("lease",lease).setParameter("key",key).executeUpdate();
        return new Claim(key,lease);
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void complete(Claim claim) {
        em.createNativeQuery("delete from media_cleanup_jobs where object_key=:key and lease=:lease")
                .setParameter("key",claim.key()).setParameter("lease",claim.lease()).executeUpdate();
    }

    @Scheduled(every="1m",concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    void cleanup() {
        if(!workers.enabled("media"))return;
        for(int i=0;i<100;i++){
            var claim=claim();if(claim==null)return;
            try{blobs.delete(claim.key());complete(claim);}
            catch(RuntimeException failure){org.jboss.logging.Logger.getLogger(MediaCleanupService.class).warn("Media cleanup deferred until lease expiry");}
        }
    }
}
