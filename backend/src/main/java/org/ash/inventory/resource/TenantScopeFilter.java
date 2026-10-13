package org.ash.inventory.resource;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.ext.Provider;
import org.ash.inventory.helper.security.ActorService;

import java.util.List;

/**
 * Tenants only manage their own private inventory. This allow-list fails closed for every other API
 * (orders, events, warehouses, operations, reports, sync, ...) in addition to the per-service checks
 * and the visibility predicates that hide public resources from tenants.
 */
@Provider
@Priority(Priorities.AUTHORIZATION + 10)
@ApplicationScoped
public class TenantScopeFilter implements ContainerRequestFilter {
    /** Path prefixes ({@code api/...}, matched on a segment boundary) open to tenants. */
    private static final List<String> TENANT_PATHS = List.of(
            "api/items", "api/assets/by-code", "api/storage-locations", "api/assemblies", "api/access",
            "api/notifications", "api/media", "api/action-inbox", "api/events/stream", "api/event-types",
            "api/inventory-codes", "api/inventory-positions", "api/inventory-assets", "api/inventory-lots");
    /** Histories that are scoped to one of the tenant's resources by the service. */
    private static final List<String> TENANT_HISTORY = List.of("api/transactions", "api/damage-reports", "api/maintenance");

    @Inject ActorService actors;

    @Override
    public void filter(ContainerRequestContext request) {
        String raw = request.getUriInfo().getPath();
        String path = raw.startsWith("/") ? raw.substring(1) : raw;
        if (!path.startsWith("api/") || path.startsWith("api/auth/")) return;
        if (ActorService.seesOrganization(actors.current())) return;
        if (TENANT_PATHS.stream().anyMatch(prefix -> matches(path, prefix))) return;
        if (TENANT_HISTORY.contains(path)) {
            // Own-item stock bookings and item/asset histories; the batch endpoint stays closed.
            var query = request.getUriInfo().getQueryParameters();
            if ("GET".equals(request.getMethod()) ? query.containsKey("itemId") || query.containsKey("assetInstanceId")
                    : "POST".equals(request.getMethod()) && path.equals("api/transactions")) return;
        }
        throw ApiException.forbidden("Not available for tenant accounts");
    }

    private static boolean matches(String path, String prefix) {
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }
}
