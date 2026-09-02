package org.ash.inventory.resource;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/** Per-caller fixed-window throttling for the public API boundary. */
@Provider
@Priority(Priorities.AUTHORIZATION)
@ApplicationScoped
public class ApiRateLimitFilter implements ContainerRequestFilter {
    @Inject SecurityIdentity identity;

    @ConfigProperty(name = "inventory.api.rate-limit.requests", defaultValue = "300")
    int requestLimit;

    @ConfigProperty(name = "inventory.api.rate-limit.window-seconds", defaultValue = "60")
    long windowSeconds;

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    @Override
    public void filter(ContainerRequestContext request) {
        if (!request.getUriInfo().getPath().startsWith("api/")) return;

        long now = Instant.now().getEpochSecond();
        long effectiveWindowSeconds = Math.max(1, windowSeconds);
        int effectiveRequestLimit = Math.max(1, requestLimit);
        long windowStart = now - Math.floorMod(now, effectiveWindowSeconds);
        String caller = caller(request);
        var allowed = new AtomicBoolean();
        Window current = windows.compute(caller, (key, previous) -> {
            if (previous == null || previous.startedAt() != windowStart) {
                allowed.set(true);
                return new Window(windowStart, 1);
            }
            int nextCount = previous.count() + 1;
            allowed.set(nextCount <= effectiveRequestLimit);
            return new Window(windowStart, nextCount);
        });

        if (allowed.get()) return;
        long retryAfter = Math.max(1, current.startedAt() + effectiveWindowSeconds - now);
        request.abortWith(jakarta.ws.rs.core.Response.status(429)
                .header("Retry-After", retryAfter)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", "API rate limit exceeded", "retryAfterSeconds", retryAfter))
                .build());
    }

    private String caller(ContainerRequestContext request) {
        if (identity != null && !identity.isAnonymous()) return "subject:" + identity.getPrincipal().getName();
        String actor = request.getHeaderString("X-Actor-Id");
        if (actor != null && !actor.isBlank()) return "actor:" + actor;
        String forwarded = request.getHeaderString("X-Forwarded-For");
        return "network:" + (forwarded == null || forwarded.isBlank() ? "anonymous" : forwarded.split(",", 2)[0].trim());
    }

    private record Window(long startedAt, int count) {}
}
