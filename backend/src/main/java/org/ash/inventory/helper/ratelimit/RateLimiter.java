package org.ash.inventory.helper.ratelimit;

/**
 * Interface for rate limiting across single-node and multi-VPS deployments.
 */
public interface RateLimiter {
    record Result(boolean allowed, long retryAfterSeconds) {}

    Result tryAcquire(String key, int limit, long windowSeconds);
}
