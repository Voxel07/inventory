package org.ash.inventory.integration.internal;

import org.ash.inventory.integration.api.OutboxStatus;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.LinkedHashMap;

@ApplicationScoped
public class OutboxOrm {
    private final EntityManager entityManager;

    public OutboxOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public long nextRevision(String type,UUID id) {
        return ((Number)entityManager.createNativeQuery("insert into integration_aggregate_sequences(aggregate_type,aggregate_id,revision) values(:type,:id,1) on conflict(aggregate_type,aggregate_id) do update set revision=integration_aggregate_sequences.revision+1 returning revision")
                .setParameter("type",type).setParameter("id",id).getSingleResult()).longValue();
    }
    public void persist(DomainEvent event) { entityManager.persist(event); }

    public List<DomainEvent> userAccessHistory(UUID userId, int offset, int limit) {
        return entityManager.createQuery("""
                from DomainEvent event
                where event.aggregateType = 'user' and event.aggregateId = :userId and event.eventType = 'user.changed'
                order by event.occurredAt desc, event.id desc
                """, DomainEvent.class)
                .setParameter("userId", userId).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<DomainEvent> claimable(Instant now, int limit) {
        return entityManager.createQuery("""
                from DomainEvent event
                where event.availableAt <= :now
                  and (event.status in :ready or event.status = :processing)
                order by event.occurredAt
                """, DomainEvent.class)
                .setParameter("now", now)
                .setParameter("ready", List.of(OutboxStatus.pending, OutboxStatus.failed))
                .setParameter("processing", OutboxStatus.processing)
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
                .setParameter("status", OutboxStatus.dead_letter)
                .setFirstResult(offset)
                .setMaxResults(limit)
                .getResultList();
    }

    public Map<OutboxStatus, Long> statusCounts() {
        var result = new LinkedHashMap<OutboxStatus, Long>();
        for (var row : entityManager.createQuery(
                "select event.status, count(event) from DomainEvent event group by event.status", Object[].class)
                .getResultList()) {
            result.put((OutboxStatus) row[0], (Long) row[1]);
        }
        return result;
    }

    public record TelemetryRow(OutboxStatus status, long count, Instant oldest) {}

    /** One bounded aggregate query; exporter callbacks only read the resulting in-memory snapshot. */
    public List<TelemetryRow> telemetrySnapshot() {
        return entityManager.createQuery(
                "select event.status, count(event), min(event.occurredAt) from DomainEvent event group by event.status", Object[].class)
                .getResultList().stream().map(row -> new TelemetryRow((OutboxStatus) row[0],
                        ((Number) row[1]).longValue(), (Instant) row[2])).toList();
    }

    /** Expire delivered notifications, retaining the user access audit history indefinitely. */
    public int deletePublishedBefore(Instant cutoff) {
        return entityManager.createNativeQuery("""
                delete from domain_event_outbox e where e.status='published' and e.published_at<:cutoff
                  and e.event_type<>'user.changed'
                  and not exists(select 1 from integration_subscriptions s where s.enabled=true and e.occurred_at>=s.since
                    and exists(select 1 from jsonb_array_elements_text(s.prefixes) as prefixes(prefix) where left(e.event_type,length(prefix))=prefix)
                    and not exists(select 1 from integration_deliveries d where d.consumer=s.name and d.event_id=e.event_id and d.state='acknowledged'))
                """).setParameter("cutoff",cutoff).executeUpdate();
    }

    public int markPublished(List<UUID> ids, Instant publishedAt) {
        if (ids.isEmpty()) return 0;
        return entityManager.createQuery("""
                update DomainEvent event
                set event.status = :published, event.publishedAt = :publishedAt, event.lastError = null
                where event.id in :ids and event.status = :processing
                """)
                .setParameter("published", OutboxStatus.published)
                .setParameter("publishedAt", publishedAt)
                .setParameter("processing", OutboxStatus.processing)
                .setParameter("ids", ids)
                .executeUpdate();
    }
}
