package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.PrivacyProjectionService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.*;
import jakarta.ws.rs.ext.Provider;
@Provider @Priority(Priorities.USER + 100)
public class PrivacyResponseFilter implements ContainerResponseFilter {
    @Inject PrivacyProjectionService projections;
    @jakarta.ws.rs.core.Context ResourceInfo resource;
    public void filter(ContainerRequestContext request, ContainerResponseContext response) {
        String path = request.getUriInfo().getPath();
        if (path.startsWith("/")) path = path.substring(1);
        if (!path.startsWith("api/") || response.getStatus() < 200 || response.getStatus() >= 300
                || response.getEntity() == null || response.getMediaType() == null
                || !response.getMediaType().isCompatible(jakarta.ws.rs.core.MediaType.APPLICATION_JSON_TYPE)) return;
        // Access policy DTOs contain grant principal IDs, not operational resource evidence.
        if (path.startsWith("api/access/") || path.startsWith("api/auth/")) {
            response.getHeaders().putSingle("Cache-Control", "private, no-store"); return;
        }
        try {
            boolean read = "GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod());
            var filtered = projections.filter(response.getEntity(), read);
            response.setEntity(filtered.value());
            if (filtered.containsPrivateReference()) response.getHeaders().putSingle("X-Private-Inventory", "true");
            // Continuation is decided by the page the query returned, not by the rows left after privacy filtering.
            if (read && filtered.value().isArray() && paged()) {
                var size = request.getUriInfo().getQueryParameters().getFirst("size");
                int limit = size != null && size.matches("\\d{1,4}") ? Integer.parseInt(size) : 100;
                response.getHeaders().putSingle("X-Has-More", filtered.queriedRows() >= limit);
            }
        } catch (ApiException denied) {
            response.setStatus(denied.status);
            response.setEntity(java.util.Map.of("message", denied.getMessage()));
        }
        response.getHeaders().putSingle("Cache-Control", "private, no-store");
    }

    private boolean paged() {
        var method = resource == null ? null : resource.getResourceMethod();
        return method != null && method.isAnnotationPresent(Paged.class);
    }
}
