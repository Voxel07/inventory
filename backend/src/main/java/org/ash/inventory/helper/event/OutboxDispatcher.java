package org.ash.inventory.helper.event;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.service.DomainEventService;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.LinkedHashMap;
import java.util.ArrayList;

/** At-least-once dispatcher. Consumers must deduplicate by eventId. */
@ApplicationScoped
public class OutboxDispatcher {
    private static final Logger LOG = Logger.getLogger(OutboxDispatcher.class);

    private final DomainEventService events;
    private final EventBroadcaster broadcaster;
    private final java.time.Duration retention;

    public OutboxDispatcher(DomainEventService events, EventBroadcaster broadcaster,
            @ConfigProperty(name = "inventory.events.outbox.retention", defaultValue = "P30D") java.time.Duration retention) {
        this.events = events;
        this.broadcaster = broadcaster;
        this.retention = retention;
    }

    /** Without this the outbox grows forever and every event leaves two dead tuples behind. */
    @Scheduled(every = "1h", delayed = "5m", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void purge() {
        int deleted = events.purgePublished(retention);
        if (deleted > 0) LOG.infov("Purged {0} published outbox events older than {1}", deleted, retention);
    }

    @Scheduled(every = "${inventory.events.outbox.dispatch-every:1s}",
            concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void dispatch() {
        var published = new ArrayList<java.util.UUID>();
        for (var event : events.claim(50)) {
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
            } catch (RuntimeException exception) {
                events.failed(event.databaseId(), exception.getMessage());
                LOG.warnv("Outbox event {0} delivery failed: {1}", event.eventId(), exception.getMessage());
            }
        }
        events.published(published);
    }
}
