package org.ash.inventory.resource;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.ash.inventory.helper.event.EventBroadcaster;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Generates weak ETags for catalog GET responses and handles If-None-Match headers (HTTP 304 Not Modified).
 */
@Provider
@Priority(Priorities.USER)
@ApplicationScoped
public class EtagResponseFilter implements ContainerRequestFilter, ContainerResponseFilter {
    private static final Set<String> CATALOG_LIST_PATHS = Set.of(
            "api/items", "api/storage-locations", "api/assemblies", "api/events", "api/factions");
    private static final int MAX_TRACKED_VARIANTS = 1_000;

    @Inject ObjectMapper objectMapper;
    @Inject EventBroadcaster broadcaster;
    private final ConcurrentHashMap<String, String> knownEtags = new ConcurrentHashMap<>();
    private Runnable removeEventListener = () -> {};

    @PostConstruct
    void initialize() {
        removeEventListener = broadcaster.addListener(event -> {
            if ("catalog.changed".equals(event.get("type"))) knownEtags.clear();
        });
    }

    @PreDestroy
    void shutdown() {
        removeEventListener.run();
    }

    @Override
    public void filter(ContainerRequestContext request) {
        String path = normalizedPath(request);
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            if (isCatalogPath(path)) knownEtags.clear();
            return;
        }
        if (!CATALOG_LIST_PATHS.contains(path)) return;

        String etag = knownEtags.get(cacheKey(request));
        String ifNoneMatch = request.getHeaderString("If-None-Match");
        if (etag != null && matches(ifNoneMatch, etag)) {
            request.abortWith(Response.status(Response.Status.NOT_MODIFIED)
                    .header("ETag", etag)
                    .header("Cache-Control", "private, no-cache, must-revalidate")
                    .build());
        }
    }

    @Override
    public void filter(ContainerRequestContext request, ContainerResponseContext response) {
        if (!"GET".equalsIgnoreCase(request.getMethod())) return;
        if (response.getStatus() != 200 || response.getEntity() == null) return;

        String path = normalizedPath(request);
        if (!CATALOG_LIST_PATHS.contains(path)) return;

        String contentHash = computeHash(response.getEntity());
        String etag = "W/\"" + contentHash + "\"";
        response.getHeaders().putSingle("ETag", etag);
        response.getHeaders().putSingle("Cache-Control", "private, no-cache, must-revalidate");
        if (knownEtags.size() >= MAX_TRACKED_VARIANTS) knownEtags.clear();
        knownEtags.put(cacheKey(request), etag);

        String ifNoneMatch = request.getHeaderString("If-None-Match");
        if (matches(ifNoneMatch, etag)) {
            response.setStatus(304);
            response.setEntity(null);
        }
    }

    private boolean isCatalogPath(String path) {
        return CATALOG_LIST_PATHS.stream().anyMatch(candidate -> path.equals(candidate) || path.startsWith(candidate + "/"));
    }

    private String normalizedPath(ContainerRequestContext request) {
        String path = request.getUriInfo().getPath();
        return path.startsWith("/") ? path.substring(1) : path;
    }

    private String cacheKey(ContainerRequestContext request) {
        String query = request.getUriInfo().getRequestUri().getRawQuery();
        return normalizedPath(request) + (query == null ? "" : "?" + query);
    }

    private boolean matches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) return false;
        if ("*".equals(ifNoneMatch.trim())) return true;
        for (String candidate : ifNoneMatch.split(",")) {
            if (etag.equals(candidate.trim())) return true;
        }
        return false;
    }

    private String computeHash(Object input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = input instanceof String value
                    ? value.getBytes(StandardCharsets.UTF_8)
                    : objectMapper.writeValueAsBytes(input);
            byte[] hash = digest.digest(bytes);
            return HexFormat.of().formatHex(hash, 0, 8);
        } catch (NoSuchAlgorithmException | JsonProcessingException e) {
            return Integer.toHexString(input.hashCode());
        }
    }
}
