package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.DomainEvent;
import org.ash.inventory.orm.OutboxOrm;
import org.ash.inventory.resource.ApiException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Writes business events in the same transaction as their aggregate changes. */
@ApplicationScoped
public class DomainEventService {
    private static final int MAX_ATTEMPTS = 10;
    private final OutboxOrm orm;

    public DomainEventService(OutboxOrm orm) {
        this.orm = orm;
    }

    public DomainEvent record(String type, String aggregateType, UUID aggregateId, UUID actorId,
            UUID idempotencyKey, Map<String, Object> payload) {
        var event = new DomainEvent();
        event.eventType = type;
        event.aggregateType = aggregateType;
        event.aggregateId = aggregateId;
        event.actorId = actorId;
        event.idempotencyKey = idempotencyKey;
        event.payload = payload == null ? new LinkedHashMap<>() : new LinkedHashMap<>(payload);
        orm.persist(event);
        return event;
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<Envelope> claim(int limit) {
        var now = Instant.now();
        var claimed = new ArrayList<Envelope>();
        for (var event : orm.claimable(now, limit)) {
            if (event.attemptCount >= MAX_ATTEMPTS) {
                event.status = DomainEnums.OutboxStatus.dead_letter;
                event.lastError = "Delivery lease expired after " + event.attemptCount + " attempts";
                continue;
            }
            event.status = DomainEnums.OutboxStatus.processing;
            event.attemptCount++;
            event.availableAt = now.plus(30, ChronoUnit.SECONDS);
            claimed.add(Envelope.from(event));
        }
        return claimed;
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void published(List<UUID> ids) {
        orm.markPublished(ids, Instant.now());
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void failed(UUID id, String message) {
        var event = orm.findLocked(id);
        if (event == null) return;
        event.status = event.attemptCount >= MAX_ATTEMPTS ? DomainEnums.OutboxStatus.dead_letter : DomainEnums.OutboxStatus.failed;
        event.availableAt = Instant.now().plusSeconds(Math.min(300, 1L << Math.min(8, event.attemptCount)));
        event.lastError = message == null ? "Unknown delivery failure" : message.substring(0, Math.min(2000, message.length()));
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<DomainEvent> deadLetters(int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid outbox page bounds");
        try {
            return orm.deadLetters(Math.multiplyExact(page, size), size);
        } catch (ArithmeticException exception) {
            throw ApiException.badRequest("Outbox page offset is too large");
        }
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public DomainEvent retryDeadLetter(UUID id) {
        var event = orm.findLocked(id);
        if (event == null) return null;
        if (event.status != DomainEnums.OutboxStatus.dead_letter) {
            throw new IllegalStateException("Only dead-letter events can be retried");
        }
        event.status = DomainEnums.OutboxStatus.failed;
        event.attemptCount = 0;
        event.availableAt = Instant.now();
        event.lastError = null;
        event.publishedAt = null;
        return event;
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Map<DomainEnums.OutboxStatus, Long> statusCounts() {
        return orm.statusCounts();
    }

    public record Envelope(UUID databaseId, UUID eventId, String type, String aggregateType, UUID aggregateId,
            UUID actorId, UUID idempotencyKey, Instant occurredAt, Map<String, Object> payload) {
        static Envelope from(DomainEvent event) {
            return new Envelope(event.id, event.eventId, event.eventType, event.aggregateType, event.aggregateId,
                    event.actorId, event.idempotencyKey, event.occurredAt,
                    Collections.unmodifiableMap(new LinkedHashMap<>(event.payload)));
        }
    }
}
