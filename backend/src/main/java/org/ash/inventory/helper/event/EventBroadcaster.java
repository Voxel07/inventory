package org.ash.inventory.helper.event;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.pubsub.PubSubCommands;
import io.quarkus.scheduler.Scheduled;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * Publishes application lifecycle and inventory events to Server-Sent Event (SSE) streams.
 */
@ApplicationScoped
public class EventBroadcaster {
    private static final Logger LOG = Logger.getLogger(EventBroadcaster.class);
    private static final String CHANNEL = "ash-inventory-events";

    private final Instance<RedisDataSource> redisDataSource;
    private final ObjectMapper objectMapper;
    private final String backend;
    private final BroadcastProcessor<Map<String, Object>> processor = BroadcastProcessor.create();
    private final CopyOnWriteArrayList<Consumer<Map<String, Object>>> internalListeners = new CopyOnWriteArrayList<>();
    private final Set<String> deliveredEventIds = ConcurrentHashMap.newKeySet();
    private volatile PubSubCommands.RedisSubscriber redisSubscriber;

    public EventBroadcaster(Instance<RedisDataSource> redisDataSource,
            ObjectMapper objectMapper,
            @ConfigProperty(name = "inventory.events.backend", defaultValue = "memory") String backend) {
        this.redisDataSource = redisDataSource;
        this.objectMapper = objectMapper;
        this.backend = backend;
    }

    @PostConstruct
    void initialize() {
        ensureRedisSubscription();
    }

    @Scheduled(every = "10s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void reconnectRedisSubscription() {
        ensureRedisSubscription();
    }

    private synchronized void ensureRedisSubscription() {
        if (!usesRedis() || redisSubscriber != null || !redisDataSource.isResolvable()) return;
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
        publish(payload(type, data));
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
        if (usesRedis()) {
            deliver(payload);
            if (!redisDataSource.isResolvable()) {
                throw new IllegalStateException("Redis event backend is configured but no Redis data source is available");
            }
            try {
                redisDataSource.get().pubsub(String.class).publish(CHANNEL, objectMapper.writeValueAsString(payload));
                return;
            } catch (Exception exception) {
                throw new IllegalStateException("Redis event publication failed", exception);
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
        Object eventId = payload.get("eventId");
        if (deliveredEventIds.size() >= 10_000) deliveredEventIds.clear();
        if (eventId != null && !deliveredEventIds.add(eventId.toString())) return;
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
