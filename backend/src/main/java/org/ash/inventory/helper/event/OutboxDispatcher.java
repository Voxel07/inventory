package org.ash.inventory.helper.event;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.service.DomainEventService;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import org.ash.inventory.helper.telemetry.InventoryTelemetry;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.context.Context;

import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** At-least-once dispatcher. Consumers must deduplicate by eventId. */
@ApplicationScoped
public class OutboxDispatcher {
    private static final Logger LOG = Logger.getLogger(OutboxDispatcher.class);
    @jakarta.inject.Inject InventoryTelemetry telemetry;

    private final DomainEventService events;
    private final EventBroadcaster broadcaster;
    private final java.time.Duration retention;
    private final AtomicBoolean wakeupQueued = new AtomicBoolean();
    private final ExecutorService wakeups = Executors.newSingleThreadExecutor(task -> {
        var thread = new Thread(task, "outbox-wakeup");
        thread.setDaemon(true);
        return thread;
    });

    public OutboxDispatcher(DomainEventService events, EventBroadcaster broadcaster,
            @ConfigProperty(name = "inventory.events.outbox.retention", defaultValue = "P30D") java.time.Duration retention) {
        this.events = events;
        this.broadcaster = broadcaster;
        this.retention = retention;
    }

    /** Without this the outbox grows forever and every event leaves two dead tuples behind. */
    @Scheduled(every = "1h", delayed = "5m", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void purge() {
        telemetry.call("outbox", "purge", "database", () -> {
            int deleted = events.purgePublished(retention);
            telemetry.count("inventory.outbox.purged", deleted, Attributes.empty());
            if (deleted > 0) LOG.infov("Purged {0} published outbox events older than {1}", deleted, retention);
            return deleted;
        });
    }

    /** Local commits dispatch immediately; the poll only covers other nodes' leftovers, retries and crashes. */
    void wake(@jakarta.enterprise.event.Observes DomainEventService.OutboxCommitted ignored) {
        if (!wakeupQueued.compareAndSet(false, true)) return;
        wakeups.execute(Context.current().wrap(() -> {
            wakeupQueued.set(false);
            try { dispatch(); }
            catch (RuntimeException exception) { LOG.warn("Outbox wake-up dispatch failed", exception); }
        }));
    }

    @jakarta.annotation.PreDestroy
    void shutdown() {
        wakeups.shutdownNow();
    }

    // Serialized: the broadcaster's processor must not receive concurrent onNext calls.
    @Scheduled(every = "${inventory.events.outbox.dispatch-every:5s}",
            concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    synchronized void dispatch() {
        telemetry.call("outbox", "dispatch", "database", () -> {
            var published = new ArrayList<java.util.UUID>();
            for (var event : events.claim(50)) {
                var parent = telemetry.restoreTraceContext(event.traceContext());
                try (var activity = telemetry.start("outbox", "deliver", "event_bus", parent, SpanKind.CONSUMER)) {
                    activity.attribute("inventory.event.id", event.eventId().toString())
                            .attribute("inventory.event.type", event.type())
                            .attribute("inventory.delivery.attempt", event.attemptCount());
                    try {
                        var payload = new LinkedHashMap<String, Object>(event.payload());
                        payload.put("eventId", event.eventId().toString());
                        payload.put("aggregateType", event.aggregateType());
                        payload.put("aggregateId", event.aggregateId().toString());
                        payload.put("occurredAt", event.occurredAt().toString());
                        if (event.actorId() != null) payload.put("actorId", event.actorId().toString());
                        if (event.idempotencyKey() != null) payload.put("idempotencyKey", event.idempotencyKey().toString());
                        broadcaster.broadcast(event.type(), payload);
                        published.add(event.databaseId());
                        var attributes = Attributes.builder().put("event_type", event.type()).put("outcome", "published").build();
                        telemetry.count("inventory.outbox.delivery.attempts", 1, attributes);
                        telemetry.measure("inventory.outbox.delivery.delay", InventoryTelemetry.ageSeconds(event.occurredAt()), "s", attributes);
                    } catch (RuntimeException exception) {
                        activity.failure(exception);
                        telemetry.count("inventory.outbox.delivery.attempts", 1,
                                Attributes.builder().put("event_type", event.type()).put("outcome", "failed").build());
                        events.failed(event.databaseId(), exception.getMessage());
                    }
                }
            }
            events.published(published);
            return null;
        });
    }
}
