package org.ash.inventory.helper.ratelimit;

import io.quarkus.redis.datasource.RedisDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
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

    @Inject
    InMemoryRateLimiter inMemory;

    @Inject
    Instance<RedisDataSource> redisDataSource;

    @ConfigProperty(name = "inventory.api.rate-limit.backend", defaultValue = "memory")
    String backend;

    @Override
    public Result tryAcquire(String key, int limit, long windowSeconds) {
        if ("redis".equalsIgnoreCase(backend) && redisDataSource.isResolvable()) {
            try {
                return tryAcquireRedis(key, limit, windowSeconds);
            } catch (Exception e) {
                LOG.warnv("Redis rate limiter failed, falling back to in-memory limiter: {0}", e.getMessage());
                return inMemory.tryAcquire(key, limit, windowSeconds);
            }
        }
        return inMemory.tryAcquire(key, limit, windowSeconds);
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
