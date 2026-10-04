package org.ash.inventory.orm;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.runtime.LaunchMode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.persistence.EntityManager;
import java.nio.charset.StandardCharsets;
/** Production gets triggers from the canonical baseline; Hibernate creates dev/test schemas. */
@ApplicationScoped
public class DevelopmentRevisionSchema {
    @Inject EntityManager em;
    @org.eclipse.microprofile.config.inject.ConfigProperty(name = "quarkus.flyway.migrate-at-start", defaultValue = "false") boolean flyway;
    @Transactional
    void initialize(@Observes StartupEvent event) {
        if (LaunchMode.current() == LaunchMode.NORMAL || flyway) return;
        try (var input = getClass().getResourceAsStream("/source-revisions.sql")) {
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            em.unwrap(org.hibernate.Session.class).doWork(connection -> {
                try (var statement = connection.createStatement()) { statement.execute(sql); }
            });
        } catch (java.io.IOException e) { throw new IllegalStateException("Cannot install revision triggers", e); }
    }
}
