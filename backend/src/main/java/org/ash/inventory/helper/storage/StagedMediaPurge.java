package org.ash.inventory.helper.storage;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.service.InventoryMediaService;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.Instant;

/** Deletes uploads that were never attached to a resource. */
@ApplicationScoped
public class StagedMediaPurge {
    private static final Logger LOG = Logger.getLogger(StagedMediaPurge.class);

    private final InventoryMediaService registry;
    private final MediaService media;
    private final Duration maxAge;

    public StagedMediaPurge(InventoryMediaService registry, MediaService media,
            @ConfigProperty(name = "inventory.media.staged-max-age", defaultValue = "PT24H") Duration maxAge) {
        this.registry = registry;
        this.media = media;
        this.maxAge = maxAge;
    }

    @Scheduled(every = "1h", delayed = "10m", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void purge() {
        int deleted = 0;
        for (String key : registry.abandonedStaged(Instant.now().minus(maxAge), 500)) {
            try {
                media.deleteObject(key);
                registry.forgetStaged(key);
                deleted++;
            } catch (RuntimeException exception) {
                LOG.warnv("Could not purge staged upload {0}: {1}", key, exception.getMessage());
            }
        }
        if (deleted > 0) LOG.infov("Purged {0} abandoned staged uploads older than {1}", deleted, maxAge);
    }
}
