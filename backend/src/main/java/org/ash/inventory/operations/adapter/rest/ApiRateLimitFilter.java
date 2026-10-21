package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.platform.ratelimit.ApiBudget;
import org.ash.inventory.platform.ratelimit.RateLimiter;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Map;

/** Per-caller throttling for the public API boundary with distributed multi-VPS support. */
@Provider
@Priority(Priorities.AUTHORIZATION)
@ApplicationScoped
public class ApiRateLimitFilter implements ContainerRequestFilter {
    @jakarta.inject.Inject org.ash.inventory.platform.ratelimit.ApiBudget budget;
    private final SecurityIdentity identity;
    private final io.quarkus.vertx.http.runtime.CurrentVertxRequest vertxRequest;
    private final boolean devAuthEnabled;

    public ApiRateLimitFilter(SecurityIdentity identity,
            io.quarkus.vertx.http.runtime.CurrentVertxRequest vertxRequest,
            @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled) {
        this.identity = identity;
        this.vertxRequest = vertxRequest;
        this.devAuthEnabled = devAuthEnabled;
    }

    @Override
    public void filter(ContainerRequestContext request) {
        // Quarkus REST reports the matched path with a leading slash.
        if (!request.getUriInfo().getPath().startsWith("/api/")) return;

        String caller = caller(request);
        RateLimiter.Result result = budget.tryAcquire(caller);

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
        if (devAuthEnabled) {
            String actor = request.getHeaderString("X-Actor-Id");
            if (actor != null && !actor.isBlank()) return "actor:" + actor;
        }
        // The peer address honours quarkus.http.proxy.* (trusted proxies only); raw forwarding headers are spoofable.
        var context = vertxRequest.getCurrent();
        var address = context == null ? null : context.request().remoteAddress();
        return "network:" + (address == null ? "unknown" : address.hostAddress());
    }
}
