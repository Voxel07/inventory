package org.ash.inventory.helper.ratelimit;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InMemoryRateLimiterTest {
    @Test
    void usesASlidingWindowAcrossFixedWindowBoundaries() {
        var now = new AtomicLong(59_000);
        var limiter = new InMemoryRateLimiter(now::get);

        assertTrue(limiter.tryAcquire("caller", 2, 60).allowed());
        assertTrue(limiter.tryAcquire("caller", 2, 60).allowed());

        now.set(61_000);
        var rejected = limiter.tryAcquire("caller", 2, 60);
        assertFalse(rejected.allowed());
        assertTrue(rejected.retryAfterSeconds() >= 58);

        now.set(119_001);
        assertTrue(limiter.tryAcquire("caller", 2, 60).allowed());
    }
}
