package org.ash.inventory.operations.internal.persistence;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.operations.internal.model.CsvImportJob;
import org.ash.inventory.operations.internal.contract.dto.CsvImportDtos;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class CsvImportOrm {
    @Inject EntityManager em;

    public CsvImportJob byCommand(UUID command) {
        return em.createQuery("from CsvImportJob where commandId = :command", CsvImportJob.class)
                .setParameter("command", command).getResultStream().findFirst().orElse(null);
    }

    public List<CsvImportDtos.Job> recent(UUID actor, UUID authenticated) {
        // Polling reads only the compact status, never the uploaded file or its reference context.
        return em.createQuery("""
                select j.id, j.filename, j.status, j.cursor, j.totalSteps, j.totalRows, j.processedRows, j.result, j.createdAt, j.updatedAt
                from CsvImportJob j where j.requestedBy = :actor and j.authenticatedBy = :authenticated
                order by case when j.status in ('queued', 'running') then 0 else 1 end, j.createdAt desc, j.id desc
                """, Object[].class).setParameter("actor", actor).setParameter("authenticated", authenticated).setMaxResults(20)
                .getResultList().stream().map(row -> new CsvImportDtos.Job((UUID)row[0], (String)row[1], (String)row[2],
                        (int)(((Number)row[3]).longValue() * 100 / Math.max(1, ((Number)row[4]).intValue())),
                        ((Number)row[5]).intValue(), ((Number)row[6]).intValue(), ((ObjectNode)row[7]).deepCopy(),
                        (java.time.Instant)row[8], (java.time.Instant)row[9])).toList();
    }

    public CsvImportJob find(UUID id) { return em.find(CsvImportJob.class, id); }
    public CsvImportJob lock(UUID id) { return em.find(CsvImportJob.class, id, LockModeType.PESSIMISTIC_WRITE); }
    public void persist(CsvImportJob job) { em.persist(job); em.flush(); }
    public void flush() { em.flush(); }

    /** The row lock lasts until both the domain changes and the checkpoint commit. No expiring lease can replay work. */
    public CsvImportJob next() {
        var rows = em.createNativeQuery("""
                select * from csv_import_jobs where status in ('queued', 'running')
                order by created_at, id for update skip locked limit 1
                """, CsvImportJob.class).getResultList();
        return rows.isEmpty() ? null : (CsvImportJob)rows.getFirst();
    }
}
