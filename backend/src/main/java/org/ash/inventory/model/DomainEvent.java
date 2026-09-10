package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Index;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Transactional outbox and immutable business-event audit stream. */
@Entity
@Table(name = "domain_event_outbox", indexes = {
        @Index(name = "ix_outbox_delivery", columnList = "status,available_at,occurred_at"),
        @Index(name = "ix_outbox_aggregate", columnList = "aggregate_type,aggregate_id,occurred_at")
})
public class DomainEvent extends BaseEntity {
    @Column(name = "event_id", nullable = false, unique = true, updatable = false) public UUID eventId;
    @Column(name = "event_type", nullable = false, updatable = false) public String eventType;
    @Column(name = "aggregate_type", nullable = false, updatable = false) public String aggregateType;
    @Column(name = "aggregate_id", nullable = false, updatable = false) public UUID aggregateId;
    @Column(name = "actor_id", updatable = false) public UUID actorId;
    @Column(name = "idempotency_key", updatable = false) public UUID idempotencyKey;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false, updatable = false)
    public Map<String, Object> payload = new LinkedHashMap<>();
    @Column(name = "occurred_at", nullable = false, updatable = false) public Instant occurredAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public DomainEnums.OutboxStatus status = DomainEnums.OutboxStatus.pending;
    @Column(name = "attempt_count", nullable = false) public int attemptCount;
    @Column(name = "available_at", nullable = false) public Instant availableAt;
    @Column(name = "published_at") public Instant publishedAt;
    @Column(name = "last_error", length = 2000) public String lastError;

    @PrePersist void initializeEvent() {
        if (eventId == null) eventId = UUID.randomUUID();
        if (occurredAt == null) occurredAt = Instant.now();
        if (availableAt == null) availableAt = occurredAt;
    }
}
