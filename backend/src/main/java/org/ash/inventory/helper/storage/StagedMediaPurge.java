package org.ash.inventory.helper.storage;

import io.opentelemetry.api.common.Attributes;
import org.ash.inventory.helper.telemetry.InventoryTelemetry;
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
    @jakarta.inject.Inject InventoryTelemetry telemetry;

    public StagedMediaPurge(InventoryMediaService registry, MediaService media,
            @ConfigProperty(name = "inventory.media.staged-max-age", defaultValue = "PT24H") Duration maxAge) {
        this.registry = registry;
        this.media = media;
        this.maxAge = maxAge;
    }

    @Scheduled(every = "1h", delayed = "10m", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void purge() {
        telemetry.call("media", "purge_staged", "registry", () -> {
            int deleted = 0;
            for (String key : registry.abandonedStaged(Instant.now().minus(maxAge), 500)) {
                try {
                    media.deleteObject(key);
                    registry.forgetStaged(key);
                    deleted++;
                } catch (RuntimeException exception) {
                    telemetry.count("inventory.media.cleanup.failures", 1, Attributes.empty());
                    LOG.warn("Could not purge a staged upload", exception);
                }
            }
            if (deleted > 0) LOG.infov("Purged {0} abandoned staged uploads older than {1}", deleted, maxAge);
            telemetry.count("inventory.media.cleanup.deleted", deleted, Attributes.empty());
            return null;
        });
    }
}
