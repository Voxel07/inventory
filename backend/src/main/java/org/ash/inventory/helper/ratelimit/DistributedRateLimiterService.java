package org.ash.inventory.helper.ratelimit;

import io.opentelemetry.api.common.Attributes;
import org.ash.inventory.helper.telemetry.InventoryTelemetry;
import io.quarkus.redis.datasource.RedisDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.UUID;

/**
 * Distributed rate limiter delegator.
 * Supports "memory" (default for single-node / dev) and "redis" (for multi-VPS clusters).
 * Falls back to in-memory gracefully if Redis is unreachable.
 */
@ApplicationScoped
public class DistributedRateLimiterService implements RateLimiter {
    private static final Logger LOG = Logger.getLogger(DistributedRateLimiterService.class);
    private static final String SLIDING_WINDOW_SCRIPT = """
            local key = KEYS[1]
            local now = tonumber(ARGV[1])
            local window = tonumber(ARGV[2])
            local limit = tonumber(ARGV[3])
            redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
            local count = redis.call('ZCARD', key)
            if count >= limit then
              local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
              local retry = math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000))
              return {0, retry}
            end
            redis.call('ZADD', key, now, ARGV[4])
            redis.call('PEXPIRE', key, window)
            return {1, 0}
            """;

    private final InMemoryRateLimiter inMemory;
    private final Instance<RedisDataSource> redisDataSource;
    private final String backend;
    @jakarta.inject.Inject InventoryTelemetry telemetry;
    private final java.util.concurrent.atomic.AtomicBoolean redisUnavailable = new java.util.concurrent.atomic.AtomicBoolean();

    public DistributedRateLimiterService(InMemoryRateLimiter inMemory, Instance<RedisDataSource> redisDataSource,
            @ConfigProperty(name = "inventory.api.rate-limit.backend", defaultValue = "memory") String backend) {
        this.inMemory = inMemory;
        this.redisDataSource = redisDataSource;
        this.backend = backend;
    }

    @Override
    public Result tryAcquire(String key, int limit, long windowSeconds) {
        if ("redis".equalsIgnoreCase(backend) && redisDataSource.isResolvable()) {
            try {
                Result result = tryAcquireRedis(key, limit, windowSeconds);
                if (redisUnavailable.getAndSet(false)) LOG.info("Redis rate limiter recovered");
                return observed(result, "redis");
            } catch (Exception e) {
                telemetry.count("inventory.ratelimit.fallbacks", 1, Attributes.empty());
                if (!redisUnavailable.getAndSet(true)) LOG.warn("Redis rate limiter failed, using in-memory limiter", e);
                return observed(inMemory.tryAcquire(key, limit, windowSeconds), "memory_fallback");
            }
        }
        if ("redis".equalsIgnoreCase(backend)) {
            telemetry.count("inventory.ratelimit.fallbacks", 1, Attributes.empty());
            if (!redisUnavailable.getAndSet(true)) LOG.warn("Redis rate limiter unavailable, using in-memory limiter");
        }
        return observed(inMemory.tryAcquire(key, limit, windowSeconds), "redis".equalsIgnoreCase(backend) ? "memory_fallback" : "memory");
    }

    private Result observed(Result result, String selectedBackend) {
        telemetry.count("inventory.ratelimit.requests", 1, Attributes.builder()
                .put("backend", selectedBackend).put("outcome", result.allowed() ? "allowed" : "denied").build());
        return result;
    }

    private Result tryAcquireRedis(String key, int limit, long windowSeconds) {
        String redisKey = "ratelimit:" + key;
        long effectiveWindowMillis = Math.max(1, windowSeconds) * 1_000L;
        int effectiveLimit = Math.max(1, limit);
        var response = redisDataSource.get().execute(
                "EVAL",
                SLIDING_WINDOW_SCRIPT,
                "1",
                redisKey,
                Long.toString(System.currentTimeMillis()),
                Long.toString(effectiveWindowMillis),
                Integer.toString(effectiveLimit),
                UUID.randomUUID().toString());
        return new Result(response.get(0).toInteger() == 1, response.get(1).toLong());
    }
}
