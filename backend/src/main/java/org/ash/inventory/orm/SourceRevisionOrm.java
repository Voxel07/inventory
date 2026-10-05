package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.helper.BusinessTime;

/** Commit-ordered change tokens from the sharded {@code source_revisions} counters (see the baseline schema). */
@ApplicationScoped
public class SourceRevisionOrm {
    private final EntityManager em;
    public SourceRevisionOrm(EntityManager em) { this.em = em; }

    public String reportToken() {
        em.flush();
        var token = new StringBuilder(BusinessTime.today().toString());
        for (var value : em.createNativeQuery("select name, sum(revision), min(epoch::text) from source_revisions group by name order by name").getResultList()) {
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
