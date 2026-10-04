package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;

@ApplicationScoped
public class ConsistentReadOrm {
    private final EntityManager em;
    public ConsistentReadOrm(EntityManager em) { this.em = em; }
    public void beginSnapshot() {
        em.unwrap(org.hibernate.Session.class).doWork(connection -> {
            try (var statement = connection.createStatement()) { statement.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"); }
        });
    }
}
