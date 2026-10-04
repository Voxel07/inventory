package org.ash.inventory.resource;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.*;
import jakarta.ws.rs.ext.Provider;
import org.ash.inventory.service.PrivacyProjectionService;

@Provider @Priority(Priorities.USER + 100)
public class PrivacyResponseFilter implements ContainerResponseFilter {
    @Inject PrivacyProjectionService projections;
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
            var filtered = projections.filter(response.getEntity());
            response.setEntity(filtered.value());
            if (filtered.containsPrivateReference()) response.getHeaders().putSingle("X-Private-Inventory", "true");
        } catch (ApiException denied) {
            response.setStatus(denied.status);
            response.setEntity(java.util.Map.of("message", denied.getMessage()));
        }
        response.getHeaders().putSingle("Cache-Control", "private, no-store");
    }
}
