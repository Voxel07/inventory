package org.ash.inventory.platform.runtime;

import io.quarkus.vertx.http.runtime.filters.Filters;
import jakarta.enterprise.event.Observes;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/** Worker processes expose health/metrics, but cannot accidentally receive application traffic. */
@ApplicationScoped
public class WorkerHttpGuard {
    @Inject WorkerRoles workers;
    void install(@Observes Filters filters) { filters.register(this::requests, 100); }
    void requests(RoutingContext context) {
        String path = context.normalizedPath();
        if (!workers.servesRequests() && (path.equals("/api") || path.startsWith("/api/") || path.equals("/mcp") || path.startsWith("/mcp/"))) {
            context.response().setStatusCode(503).putHeader("Retry-After", "5").end();
        } else context.next();
    }
}
