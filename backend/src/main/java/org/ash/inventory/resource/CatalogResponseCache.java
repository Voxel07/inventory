package org.ash.inventory.resource;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.cache.CacheManager;
import io.quarkus.cache.CacheResult;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.event.EventBroadcaster;
import org.ash.inventory.service.CatalogService;
import org.jboss.logging.Logger;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Caches API-ready catalog snapshots rather than managed Hibernate entities.
 * The JSON-compatible values are safe to serialize into the shared Valkey cache
 * and can be consumed by any API replica.
 */
@ApplicationScoped
public class CatalogResponseCache {
    private static final Logger LOG = Logger.getLogger(CatalogResponseCache.class);
    private final CatalogService catalog;
    private final ApiMapper mapper;
    private final ObjectMapper objectMapper;
    private final CacheManager cacheManager;
    private final EventBroadcaster broadcaster;
    private Runnable removeEventListener = () -> {};

    public CatalogResponseCache(CatalogService catalog, ApiMapper mapper, ObjectMapper objectMapper,
            CacheManager cacheManager, EventBroadcaster broadcaster) {
        this.catalog = catalog;
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.cacheManager = cacheManager;
        this.broadcaster = broadcaster;
    }

    @PostConstruct
    void initializeInvalidationListener() {
        removeEventListener = broadcaster.addListener(event -> {
            if (!"catalog.changed".equals(event.get("type"))) return;
            invalidateFor(String.valueOf(event.get("resource")));
        });
    }

    @PreDestroy
    void shutdownInvalidationListener() {
        removeEventListener.run();
    }

    @CacheResult(cacheName = "locations-cache")
    @Transactional
    public String locations() {
        return json(catalog.getLocations().stream().map(mapper::location).toList());
    }

    @CacheResult(cacheName = "assemblies-cache")
    @Transactional
    public String assemblies() {
        return json(mapper.assemblies(catalog.getAssemblies()));
    }

    @CacheResult(cacheName = "events-cache")
    @Transactional
    public String events(String eventType) {
        return json(catalog.getEvents(eventType).stream().map(mapper::event).toList());
    }

    @CacheResult(cacheName = "factions-cache")
    @Transactional
    public String factions(String eventType) {
        return json(catalog.getFactions(eventType).stream().map(mapper::faction).toList());
    }

    private String json(java.util.List<?> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize catalog response", exception);
        }
    }

    private void invalidateFor(String resource) {
        Set<String> cacheNames = new LinkedHashSet<>();
        switch (resource) {
            case "items" -> cacheNames.add("assemblies-cache");
            case "storage-locations" -> cacheNames.addAll(Set.of("locations-cache", "assemblies-cache"));
            case "assemblies" -> cacheNames.add("assemblies-cache");
            case "events" -> cacheNames.add("events-cache");
            case "factions" -> cacheNames.add("factions-cache");
            default -> cacheNames.addAll(Set.of("locations-cache", "assemblies-cache", "events-cache", "factions-cache"));
        }
        for (String cacheName : cacheNames) {
            cacheManager.getCache(cacheName).ifPresent(cache ->
                    cache.invalidateAll().subscribe().with(ignored -> {}, failure ->
                            LOG.warnv("Could not invalidate catalog cache {0}: {1}", cacheName, failure.getMessage())));
        }
    }
}
