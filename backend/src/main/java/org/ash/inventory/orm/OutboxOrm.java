package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.DomainEvent;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.LinkedHashMap;

@ApplicationScoped
public class OutboxOrm {
    private final EntityManager entityManager;

    public OutboxOrm(EntityManager entityManager) { this.entityManager = entityManager; }

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

    public List<DomainEvent> deadLetters(int offset, int limit) {
        return entityManager.createQuery("from DomainEvent event where event.status = :status order by event.occurredAt", DomainEvent.class)
                .setParameter("status", DomainEnums.OutboxStatus.dead_letter)
                .setFirstResult(offset)
                .setMaxResults(limit)
                .getResultList();
    }

    public Map<DomainEnums.OutboxStatus, Long> statusCounts() {
        var result = new LinkedHashMap<DomainEnums.OutboxStatus, Long>();
        for (var row : entityManager.createQuery(
                "select event.status, count(event) from DomainEvent event group by event.status", Object[].class)
                .getResultList()) {
            result.put((DomainEnums.OutboxStatus) row[0], (Long) row[1]);
        }
        return result;
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
