package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.DomainEvent;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class OutboxOrm {
    @Inject EntityManager entityManager;

    public void persist(DomainEvent event) { entityManager.persist(event); }

    public List<DomainEvent> claimable(Instant now, int limit) {
        return entityManager.createQuery("""
                from DomainEvent event
                where event.availableAt <= :now
                  and (event.status in :ready or event.status = :processing)
                order by event.occurredAt
                """, DomainEvent.class)
                .setParameter("now", now)
                .setParameter("ready", List.of(DomainEnums.OutboxStatus.pending, DomainEnums.OutboxStatus.failed))
                .setParameter("processing", DomainEnums.OutboxStatus.processing)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                // Hibernate maps the JPA skip-locked sentinel (-2) to FOR UPDATE SKIP LOCKED.
                .setHint("jakarta.persistence.lock.timeout", -2)
                .setMaxResults(limit)
                .getResultList();
    }

    public DomainEvent findLocked(UUID id) {
        return entityManager.find(DomainEvent.class, id, LockModeType.PESSIMISTIC_WRITE);
    }

    public int markPublished(List<UUID> ids, Instant publishedAt) {
        if (ids.isEmpty()) return 0;
        return entityManager.createQuery("""
                update DomainEvent event
                set event.status = :published, event.publishedAt = :publishedAt, event.lastError = null
                where event.id in :ids and event.status = :processing
                """)
                .setParameter("published", DomainEnums.OutboxStatus.published)
                .setParameter("publishedAt", publishedAt)
                .setParameter("processing", DomainEnums.OutboxStatus.processing)
                .setParameter("ids", ids)
                .executeUpdate();
    }
}
