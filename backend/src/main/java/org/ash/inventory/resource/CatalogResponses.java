package org.ash.inventory.resource;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.cache.Cache;
import io.quarkus.cache.CacheName;
import java.time.Duration;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.service.CatalogService;
import org.jboss.logging.Logger;


/**
 * Pre-serialized catalog responses. Factions are cached per node (Caffeine) under their
 * commit-ordered source revision, so every replica switches to a new snapshot as soon as the
 * change commits; no invalidation message is needed. Events are serialized on each request.
 */
@ApplicationScoped
public class CatalogResponses {
    private static final Logger LOG = Logger.getLogger(CatalogResponses.class);
    private final CatalogService catalog;
    private final ApiMapper mapper;
    @jakarta.inject.Inject org.ash.inventory.service.ApiQueryService queries;
    private final ObjectMapper objectMapper;
    private final Cache cache;

    public CatalogResponses(CatalogService catalog, ApiMapper mapper, ObjectMapper objectMapper,
            @CacheName("factions-cache") Cache cache) {
        this.catalog = catalog;
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.cache = cache;
    }

    @Transactional
    public String events(String eventType) {
        return json(queries.projectEvents(catalog.getEvents(eventType)));
    }

    @jakarta.inject.Inject org.ash.inventory.orm.SourceRevisionOrm revisions;

    /** Weak ETag of the faction list derived from the committed revision; a match skips all catalog reads. */
    @Transactional
    public String factionsEtag(String eventType) {
        return "W/\"" + revisions.factions() + "." + Integer.toHexString(eventType.trim().hashCode()) + "\"";
    }

    @org.ash.inventory.helper.ConsistentRead
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public String factions(String eventType) {
        String normalized = eventType == null || eventType.isBlank() ? "" : eventType.trim();
        if (normalized.length() > 255) throw ApiException.badRequest("eventType is too long");
        return selectFactions(cachedFactions(revisions.factions()), normalized);
    }
    String cachedFactions(String revision) {
        var loadFailure = new java.util.concurrent.atomic.AtomicReference<RuntimeException>();
        try {
            return cache.<String, String>get(revision, key -> {
                try { return loadFactions(); }
                catch (RuntimeException failure) { loadFailure.set(failure); throw failure; }
            }).await().atMost(Duration.ofSeconds(2));
        } catch (RuntimeException failure) {
            if (loadFailure.get() != null) throw loadFailure.get();
            LOG.warnv("Faction cache unavailable; reading database: {0}", failure.getMessage());
            return loadFactions();
        }
    }
    String loadFactions() {
        return json(catalog.getFactions(null).stream().map(mapper::faction).toList());
    }

    private String selectFactions(String snapshot, String eventType) {
        if (eventType.isEmpty()) return snapshot;
        try {
            var selected = objectMapper.createArrayNode();
            for (var row : objectMapper.readTree(snapshot))
                if (eventType.equals(row.path("eventType").asText())) selected.add(row);
            return objectMapper.writeValueAsString(selected);
        } catch (JsonProcessingException e) { throw new IllegalStateException("Invalid faction snapshot", e); }
    }

    private String json(java.util.List<?> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize catalog response", exception);
        }
    }

}
