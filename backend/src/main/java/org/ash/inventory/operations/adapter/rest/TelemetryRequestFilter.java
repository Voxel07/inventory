package org.ash.inventory.operations.adapter.rest;

import io.opentelemetry.api.trace.Span;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.container.ResourceInfo;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

/** Debug summaries use route templates and omit query strings, headers and bodies. */
@Provider
public class TelemetryRequestFilter implements ContainerRequestFilter, ContainerResponseFilter {
    private static final Logger LOG = Logger.getLogger(TelemetryRequestFilter.class);
    private static final String STARTED = TelemetryRequestFilter.class.getName() + ".started";
    @Context ResourceInfo resource;

    @Override public void filter(ContainerRequestContext request) { request.setProperty(STARTED, System.nanoTime()); }

    @Override public void filter(ContainerRequestContext request, ContainerResponseContext response) {
        var span = Span.current().getSpanContext();
        if (span.isValid()) response.getHeaders().putSingle("X-Trace-Id", span.getTraceId());
        String route = route();
        var started = request.getProperty(STARTED);
        double elapsed = started instanceof Long value ? (System.nanoTime() - value) / 1_000_000.0 : 0;
        LOG.debugf("method=%s route=%s status=%d response_headers_ms=%.3f trace_id=%s",
                request.getMethod(), route, response.getStatus(), elapsed, span.getTraceId());
    }

    private String route() {
        if (resource.getResourceClass() == null || resource.getResourceMethod() == null) return "unmatched";
        var root = resource.getResourceClass().getAnnotation(jakarta.ws.rs.Path.class);
        var method = resource.getResourceMethod().getAnnotation(jakarta.ws.rs.Path.class);
        return (root == null ? "" : root.value()) + (method == null ? "" : method.value());
    }
}
