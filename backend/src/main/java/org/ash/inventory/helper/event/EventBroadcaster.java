package org.ash.inventory.helper.event;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.pubsub.PubSubCommands;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.transaction.Status;
import jakarta.transaction.Synchronization;
import jakarta.transaction.TransactionSynchronizationRegistry;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * Publishes application lifecycle and inventory events to Server-Sent Event (SSE) streams.
 */
@ApplicationScoped
public class EventBroadcaster {
    private static final Logger LOG = Logger.getLogger(EventBroadcaster.class);
    private static final String CHANNEL = "ash-inventory-events";

    @Inject TransactionSynchronizationRegistry transactions;
    @Inject Instance<RedisDataSource> redisDataSource;
    @Inject ObjectMapper objectMapper;
    @ConfigProperty(name = "inventory.events.backend", defaultValue = "memory") String backend;
    private final BroadcastProcessor<Map<String, Object>> processor = BroadcastProcessor.create();
    private final CopyOnWriteArrayList<Consumer<Map<String, Object>>> internalListeners = new CopyOnWriteArrayList<>();
    private PubSubCommands.RedisSubscriber redisSubscriber;

    @PostConstruct
    void initialize() {
        if (!usesRedis() || !redisDataSource.isResolvable()) return;
        try {
            redisSubscriber = redisDataSource.get().pubsub(String.class).subscribe(CHANNEL, this::receiveRedisEvent);
        } catch (RuntimeException exception) {
            LOG.warnv("Redis event subscription unavailable; this node will use local events: {0}", exception.getMessage());
        }
    }

    @PreDestroy
    void shutdown() {
        if (redisSubscriber != null) redisSubscriber.unsubscribe();
    }

    public void broadcast(String type, Map<String, Object> data) {
        Map<String, Object> payload = payload(type, data);
        int status = transactions.getTransactionStatus();
        if (status == Status.STATUS_ACTIVE || status == Status.STATUS_MARKED_ROLLBACK) {
            transactions.registerInterposedSynchronization(new Synchronization() {
                @Override public void beforeCompletion() {}
                @Override public void afterCompletion(int completionStatus) {
                    if (completionStatus == Status.STATUS_COMMITTED) publish(payload);
                }
            });
            return;
        }
        publish(payload);
    }

    private Map<String, Object> payload(String type, Map<String, Object> data) {
        var payload = new LinkedHashMap<String, Object>();
        payload.put("type", type);
        payload.put("timestamp", Instant.now().toString());
        if (data != null) {
            payload.putAll(data);
        }
        return payload;
    }

    public Multi<Map<String, Object>> stream() {
        Multi<Map<String, Object>> heartbeat = Multi.createFrom().ticks().every(Duration.ofSeconds(20))
                .map(ignored -> payload("heartbeat", Map.of()));
        return Multi.createBy().merging().streams(processor, heartbeat);
    }

    /** Registers an in-process listener, including for events received from other Redis-backed nodes. */
    public Runnable addListener(Consumer<Map<String, Object>> listener) {
        internalListeners.add(listener);
        return () -> internalListeners.remove(listener);
    }

    private void publish(Map<String, Object> payload) {
        if (usesRedis() && redisDataSource.isResolvable() && redisSubscriber != null) {
            try {
                redisDataSource.get().pubsub(String.class).publish(CHANNEL, objectMapper.writeValueAsString(payload));
                return;
            } catch (Exception exception) {
                LOG.warnv("Redis event publication failed; delivering locally: {0}", exception.getMessage());
            }
        }
        deliver(payload);
    }

    private void receiveRedisEvent(String encoded) {
        try {
            deliver(objectMapper.readValue(encoded, new TypeReference<Map<String, Object>>() {}));
        } catch (Exception exception) {
            LOG.warnv("Ignoring malformed Redis inventory event: {0}", exception.getMessage());
        }
    }

    private void deliver(Map<String, Object> payload) {
        processor.onNext(payload);
        for (var listener : internalListeners) {
            try {
                listener.accept(payload);
            } catch (RuntimeException exception) {
                LOG.warnv("Inventory event listener failed: {0}", exception.getMessage());
            }
        }
    }

    private boolean usesRedis() {
        return "redis".equalsIgnoreCase(backend);
    }
}
