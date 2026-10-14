package org.ash.inventory.service;

import io.opentelemetry.api.common.Attributes;
import org.ash.inventory.helper.telemetry.InventoryTelemetry;
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
    private static final org.jboss.logging.Logger LOG = org.jboss.logging.Logger.getLogger(DomainEventService.class);
    private static final int MAX_ATTEMPTS = 10;
    private static final Object WAKEUP_REGISTERED = new Object();
    private final OutboxOrm orm;
    @jakarta.inject.Inject org.ash.inventory.helper.security.ActorService actors;
    @jakarta.inject.Inject jakarta.transaction.TransactionSynchronizationRegistry transactions;
    @jakarta.inject.Inject jakarta.enterprise.event.Event<OutboxCommitted> committed;
    @jakarta.inject.Inject InventoryTelemetry telemetry;

    /** Fired after a transaction that wrote outbox rows commits, so this node dispatches without waiting for the poll. */
    public record OutboxCommitted() {}

    public DomainEventService(OutboxOrm orm) {
        this.orm = orm;
    }

    public DomainEvent record(String type, String aggregateType, UUID aggregateId, UUID actorId,
            UUID idempotencyKey, Map<String, Object> payload) {
        try (var activity = telemetry.start("business", "record_event", "database",
                io.opentelemetry.context.Context.current(), io.opentelemetry.api.trace.SpanKind.PRODUCER)) {
            activity.attribute("inventory.event.type", type).attribute("inventory.aggregate.type", aggregateType);
            try {
                var event = new DomainEvent();
                event.eventType = type;
                event.aggregateType = aggregateType;
                event.aggregateId = aggregateId;
                event.actorId = actorId;
                event.idempotencyKey = idempotencyKey;
                event.payload = payload == null ? new LinkedHashMap<>() : new LinkedHashMap<>(payload);
                event.traceContext.putAll(telemetry.captureTraceContext());
                orm.persist(event);
                // Observe committed changes once, rather than retries of outbox publication or rolled-back commands.
                var attributes = Attributes.builder().put("event_type", type)
                        .put("aggregate_type", aggregateType).build();
                transactions.registerInterposedSynchronization(new jakarta.transaction.Synchronization() {
                    public void beforeCompletion() {}
                    public void afterCompletion(int status) {
                        if (status == jakarta.transaction.Status.STATUS_COMMITTED) {
                            telemetry.count("inventory.business.events", 1, attributes);
                            LOG.debugf(
                                    "Committed event type=%s aggregate_type=%s event_id=%s", type, aggregateType, event.eventId);
                        }
                    }
                });
                wakeDispatcherAfterCommit();
                activity.attribute("inventory.event.id", event.eventId.toString());
                return event;
            } catch (RuntimeException exception) { activity.failure(exception); throw exception; }
        }
    }

    private void wakeDispatcherAfterCommit() {
        if (transactions.getResource(WAKEUP_REGISTERED) != null) return;
        transactions.putResource(WAKEUP_REGISTERED, Boolean.TRUE);
        transactions.registerInterposedSynchronization(new jakarta.transaction.Synchronization() {
            public void beforeCompletion() {}
            public void afterCompletion(int status) {
                if (status == jakarta.transaction.Status.STATUS_COMMITTED) committed.fire(new OutboxCommitted());
            }
        });
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<Envelope> claim(int limit) {
        var now = Instant.now();
        var claimed = new ArrayList<Envelope>();
        for (var event : orm.claimable(now, limit)) {
            if (event.attemptCount >= MAX_ATTEMPTS) {
                event.status = DomainEnums.OutboxStatus.dead_letter;
                event.lastError = "Delivery lease expired after " + event.attemptCount + " attempts";
                deadLetter(event);
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
    public int purgePublished(java.time.Duration retention) {
        return orm.deletePublishedBefore(Instant.now().minus(retention));
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void failed(UUID id, String message) {
        var event = orm.findLocked(id);
        // A late delivery failure must not reopen a terminal event or count a dead letter twice.
        if (event == null || event.status == DomainEnums.OutboxStatus.published
                || event.status == DomainEnums.OutboxStatus.dead_letter) return;
        event.status = event.attemptCount >= MAX_ATTEMPTS ? DomainEnums.OutboxStatus.dead_letter : DomainEnums.OutboxStatus.failed;
        event.availableAt = Instant.now().plusSeconds(Math.min(300, 1L << Math.min(8, event.attemptCount)));
        event.lastError = message == null ? "Unknown delivery failure" : message.substring(0, Math.min(2000, message.length()));
        if (event.status == DomainEnums.OutboxStatus.dead_letter) deadLetter(event);
    }

    private void deadLetter(DomainEvent event) {
        var attributes = Attributes.builder().put("event_type", event.eventType).build();
        transactions.registerInterposedSynchronization(new jakarta.transaction.Synchronization() {
            public void beforeCompletion() {}
            public void afterCompletion(int status) {
                if (status == jakarta.transaction.Status.STATUS_COMMITTED) {
                    telemetry.count("inventory.outbox.dead_letters", 1, attributes);
                    LOG.errorf(
                            "Outbox dead letter event_id=%s event_type=%s attempts=%d", event.eventId, event.eventType, event.attemptCount);
                }
            }
        });
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<DomainEvent> deadLetters(int page, int size) {
        actors.requireAdmin();
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid outbox page bounds");
        try {
            return orm.deadLetters(Math.multiplyExact(page, size), size);
        } catch (ArithmeticException exception) {
            throw ApiException.badRequest("Outbox page offset is too large");
        }
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public DomainEvent retryDeadLetter(UUID id) {
        actors.requireAdmin();
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
        actors.requireAdmin();
        return orm.statusCounts();
    }

    public record Envelope(UUID databaseId, UUID eventId, String type, String aggregateType, UUID aggregateId,
            UUID actorId, UUID idempotencyKey, Instant occurredAt, Map<String, Object> payload,
            Map<String, String> traceContext, int attemptCount) {
        static Envelope from(DomainEvent event) {
            return new Envelope(event.id, event.eventId, event.eventType, event.aggregateType, event.aggregateId,
                    event.actorId, event.idempotencyKey, event.occurredAt,
                    Collections.unmodifiableMap(new LinkedHashMap<>(event.payload)),
                    Map.copyOf(event.traceContext), event.attemptCount);
        }
    }
}
