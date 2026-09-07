package org.ash.inventory.helper.ratelimit;

import jakarta.enterprise.context.ApplicationScoped;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Sliding-window rate limiter with automatic TTL cleanup for single-instance
 * mode.
 */
@ApplicationScoped
public class InMemoryRateLimiter implements RateLimiter {

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final AtomicLong lastCleanupMillis = new AtomicLong();
    private final LongSupplier clockMillis;

    public InMemoryRateLimiter() {
        this(System::currentTimeMillis);
    }

    InMemoryRateLimiter(LongSupplier clockMillis) {
        this.clockMillis = clockMillis;
    }

    @Override
    public Result tryAcquire(String key, int limit, long windowSeconds) {
        long now = clockMillis.getAsLong();
        long effectiveWindowMillis = Math.max(1, windowSeconds) * 1_000L;
        int effectiveLimit = Math.max(1, limit);
        long cutoff = now - effectiveWindowMillis;

        maybeEvictStale(now, effectiveWindowMillis);

        var result = new AtomicReference<Result>();
        windows.compute(key, (ignored, previous) -> {
            var requests = new ArrayList<Long>();
            if (previous != null) {
                previous.requests().stream().filter(timestamp -> timestamp > cutoff).forEach(requests::add);
            }
            if (requests.size() >= effectiveLimit) {
                long retryMillis = requests.getFirst() + effectiveWindowMillis - now;
                result.set(new Result(false, Math.max(1, (retryMillis + 999) / 1_000)));
            } else {
                requests.add(now);
                result.set(new Result(true, 0));
            }
            return new Window(List.copyOf(requests), now);
        });
        return result.get();
    }

    private void maybeEvictStale(long now, long windowMillis) {
        long previousCleanup = lastCleanupMillis.get();
        long cleanupInterval = Math.min(60_000L, windowMillis);
        if (now - previousCleanup < cleanupInterval || !lastCleanupMillis.compareAndSet(previousCleanup, now)) return;
        long cutoff = now - windowMillis;
        windows.entrySet().removeIf(entry -> entry.getValue().lastAccess() < cutoff);
    }

    private record Window(List<Long> requests, long lastAccess) {
    }
}
