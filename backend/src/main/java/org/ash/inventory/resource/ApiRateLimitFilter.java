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

import org.ash.inventory.helper.ratelimit.DistributedRateLimiterService;
import org.ash.inventory.helper.ratelimit.RateLimiter;

import java.util.Map;

/** Per-caller throttling for the public API boundary with distributed multi-VPS support. */
@Provider
@Priority(Priorities.AUTHORIZATION)
@ApplicationScoped
public class ApiRateLimitFilter implements ContainerRequestFilter {
    @Inject SecurityIdentity identity;
    @Inject DistributedRateLimiterService rateLimiter;

    @ConfigProperty(name = "inventory.api.rate-limit.requests", defaultValue = "300")
    int requestLimit;

    @ConfigProperty(name = "inventory.api.rate-limit.window-seconds", defaultValue = "60")
    long windowSeconds;

    @Override
    public void filter(ContainerRequestContext request) {
        if (!request.getUriInfo().getPath().startsWith("api/")) return;

        String caller = caller(request);
        RateLimiter.Result result = rateLimiter.tryAcquire(caller, requestLimit, windowSeconds);

        if (result.allowed()) return;

        long retryAfter = result.retryAfterSeconds();
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
}
