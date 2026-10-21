package org.ash.inventory.integration.api;

import org.ash.inventory.platform.runtime.WorkerRoles;
import org.ash.inventory.platform.telemetry.InventoryTelemetry;

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
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.metrics.ObservableLongGauge;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Publishes application lifecycle and inventory events to Server-Sent Event (SSE) streams.
 */
@ApplicationScoped
public class EventBroadcaster {
    @jakarta.inject.Inject org.ash.inventory.platform.runtime.WorkerRoles workers;
    private static final Logger LOG = Logger.getLogger(EventBroadcaster.class);
    private static final String CHANNEL = "ash-inventory-events";

    private final Instance<RedisDataSource> redisDataSource;
    private final ObjectMapper objectMapper;
    private final String backend;
    private final BroadcastProcessor<Map<String, Object>> processor = BroadcastProcessor.create();
    private final Set<String> deliveredEventIds = ConcurrentHashMap.newKeySet();
    private volatile PubSubCommands.RedisSubscriber redisSubscriber;
    private final InventoryTelemetry telemetry;
    private final java.util.concurrent.atomic.AtomicBoolean subscriptionUnavailable = new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.concurrent.atomic.AtomicLong subscriptionGeneration = new java.util.concurrent.atomic.AtomicLong();
    private volatile boolean shuttingDown;
    private ObservableLongGauge subscriptionGauge;

    public EventBroadcaster(Instance<RedisDataSource> redisDataSource,
            ObjectMapper objectMapper, InventoryTelemetry telemetry,
            @ConfigProperty(name = "inventory.events.backend", defaultValue = "memory") String backend) {
        this.redisDataSource = redisDataSource;
        this.objectMapper = objectMapper;
        this.backend = backend;
        this.telemetry = telemetry;
    }

    @PostConstruct
    void initialize() {
        subscriptionGauge = telemetry.meter().gaugeBuilder("inventory.redis.subscription.connected").ofLongs()
                .buildWithCallback(measurement -> {
                    if (usesRedis()) measurement.record(redisSubscriber == null ? 0 : 1);
                });
        ensureRedisSubscription();
    }

    @Scheduled(every = "10s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void reconnectRedisSubscription() {
        ensureRedisSubscription();
    }

    private synchronized void ensureRedisSubscription() {
        if (!workers.servesRequests() || shuttingDown || !usesRedis() || redisSubscriber != null || !redisDataSource.isResolvable()) return;
        long generation = subscriptionGeneration.incrementAndGet();
        try {
            var subscriber = redisDataSource.get().pubsub(String.class).subscribe(CHANNEL, this::receiveRedisEvent,
                    () -> subscriptionEnded(generation, null), exception -> subscriptionEnded(generation, exception));
            if (subscriptionGeneration.get() != generation) { subscriber.unsubscribe(); return; }
            redisSubscriber = subscriber;
            telemetry.count("inventory.redis.subscriptions", 1, InventoryTelemetry.dimensions("connect", "success"));
            if (subscriptionUnavailable.getAndSet(false)) LOG.info("Redis inventory event subscription recovered");
        } catch (RuntimeException exception) {
            subscriptionEnded(generation, exception);
        }
    }

    private void subscriptionEnded(long generation, Throwable exception) {
        if (!subscriptionGeneration.compareAndSet(generation, generation + 1)) return;
        redisSubscriber = null;
        if (shuttingDown) return;
        telemetry.count("inventory.redis.subscriptions", 1, InventoryTelemetry.dimensions("disconnect", "failed"));
        if (!subscriptionUnavailable.getAndSet(true)) {
            LOG.warn("Redis inventory event subscription unavailable; reconnecting on the next poll", exception);
        }
    }

    @PreDestroy
    void shutdown() {
        shuttingDown = true;
        if (redisSubscriber != null) redisSubscriber.unsubscribe();
        if (subscriptionGauge != null) subscriptionGauge.close();
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

    private void publish(Map<String, Object> payload) {
        telemetry.call("redis", "publish_event", usesRedis() ? "redis" : "memory", () -> {
            if (usesRedis()) {
                deliver(payload);
                if (!redisDataSource.isResolvable()) {
                    throw new IllegalStateException("Redis event backend is configured but no Redis data source is available");
                }
                try {
                    redisDataSource.get().pubsub(String.class).publish(CHANNEL, objectMapper.writeValueAsString(payload));
                    return null;
                } catch (Exception exception) {
                    throw new IllegalStateException("Redis event publication failed", exception);
                }
            }
            deliver(payload);
            return null;
        });
    }

    private void receiveRedisEvent(String encoded) {
        try {
            deliver(objectMapper.readValue(encoded, new TypeReference<Map<String, Object>>() {}));
        } catch (Exception exception) {
            telemetry.count("inventory.redis.events.invalid", 1, Attributes.empty());
            LOG.warnf("Ignoring malformed Redis inventory event; exception_type=%s", exception.getClass().getName());
        }
    }

    private void deliver(Map<String, Object> payload) {
        Object eventId = payload.get("eventId");
        if (deliveredEventIds.size() >= 10_000) deliveredEventIds.clear();
        if (eventId != null && !deliveredEventIds.add(eventId.toString())) return;
        telemetry.count("inventory.events.received", 1, Attributes.builder().put("backend", usesRedis() ? "redis" : "memory").build());
        processor.onNext(payload);
    }

    private boolean usesRedis() {
        return "redis".equalsIgnoreCase(backend);
    }
}
