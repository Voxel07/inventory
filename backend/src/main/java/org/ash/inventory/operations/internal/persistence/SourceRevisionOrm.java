package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
/** Commit-ordered change tokens from the sharded {@code source_revisions} counters (see the baseline schema). */
@ApplicationScoped
public class SourceRevisionOrm {
    private final EntityManager em;
    public SourceRevisionOrm(EntityManager em) { this.em = em; }

    public String reportToken(String report) {
        em.flush();
        var token = new StringBuilder(BusinessTime.today().toString());
        for (var value : em.createNativeQuery("select name, sum(revision), min(epoch::text) from source_revisions where name in :sources group by name order by name").setParameter("sources",ReportSources.TABLES.get(report)).getResultList()) {
            var row = (Object[]) value;
            token.append('|').append(row[0]).append(':').append(row[1]).append(':').append(row[2]);
        }
        return token.toString();
    }

    public String factions() {
        em.flush();
        var row = (Object[]) em.createNativeQuery("select min(epoch::text), sum(revision) from source_revisions where name = 'factions'").getSingleResult();
        return row[0] + ":" + row[1];
    }
}
