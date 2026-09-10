package org.ash.inventory.helper.event;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.service.DomainEventService;
import org.jboss.logging.Logger;

import java.util.LinkedHashMap;
import java.util.ArrayList;

/** At-least-once dispatcher. Consumers must deduplicate by eventId. */
@ApplicationScoped
public class OutboxDispatcher {
    private static final Logger LOG = Logger.getLogger(OutboxDispatcher.class);

    @Inject DomainEventService events;
    @Inject EventBroadcaster broadcaster;

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
