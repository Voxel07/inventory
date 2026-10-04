package org.ash.inventory.orm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
@ApplicationScoped
public class SourceRevisionOrm {
    private final EntityManager em;
    public SourceRevisionOrm(EntityManager em) { this.em = em; }
    public String reportToken() {
        em.flush();
        var token = new StringBuilder(java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString());
        for (var row : em.createQuery("select r.name, r.revision, r.epoch from SourceRevision r order by r.name", Object[].class).getResultList())
            token.append('|').append(row[0]).append(':').append(row[1]).append(':').append(row[2]);
        return token.toString();
    }
    public String factions() {
        em.flush();
        var row = em.createQuery("select r.epoch, r.revision from SourceRevision r where r.name = 'factions'", Object[].class).getSingleResult();
        return row[0] + ":" + row[1];
    }
}
