package org.ash.inventory.helper.telemetry;

import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.metrics.ObservableDoubleGauge;
import io.opentelemetry.api.metrics.ObservableLongGauge;
import io.quarkus.scheduler.Scheduled;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.orm.OutboxOrm;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.util.EnumMap;
import java.util.Map;

@ApplicationScoped
public class OutboxTelemetry {
    @Inject InventoryTelemetry telemetry;
    @Inject OutboxOrm orm;
    @ConfigProperty(name = "quarkus.otel.sdk.disabled") boolean disabled;
    private record Snapshot(Map<DomainEnums.OutboxStatus, OutboxOrm.TelemetryRow> rows, Instant collectedAt) {}
    private volatile Snapshot snapshot;
    private ObservableLongGauge counts;
    private ObservableDoubleGauge oldest, freshness;

    @PostConstruct void initialize() {
        counts = telemetry.meter().gaugeBuilder("inventory.outbox.entries").ofLongs().setUnit("{event}")
                .buildWithCallback(measurement -> {
                    var current = snapshot;
                    if (current == null) return;
                    for (var status : DomainEnums.OutboxStatus.values()) {
                        var row = current.rows().get(status);
                        measurement.record(row == null ? 0 : row.count(), attributes(status));
                    }
                });
        oldest = telemetry.meter().gaugeBuilder("inventory.outbox.oldest_age").setUnit("s")
                .buildWithCallback(measurement -> {
                    var current = snapshot;
                    if (current == null) return;
                    for (var status : DomainEnums.OutboxStatus.values()) {
                        if (status == DomainEnums.OutboxStatus.published) continue;
                        var row = current.rows().get(status);
                        measurement.record(row == null ? 0 : InventoryTelemetry.ageSeconds(row.oldest()), attributes(status));
                    }
                });
        freshness = telemetry.meter().gaugeBuilder("inventory.outbox.snapshot_age").setUnit("s")
                .buildWithCallback(measurement -> {
                    var current = snapshot;
                    if (current != null) measurement.record(InventoryTelemetry.ageSeconds(current.collectedAt()));
                });
    }

    private static Attributes attributes(DomainEnums.OutboxStatus status) {
        return Attributes.builder().put("status", status.name()).put("scope", "shared_database").build();
    }

    @Scheduled(every = "${inventory.telemetry.outbox-snapshot-every:30s}", delayed = "10s",
            concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    void refresh() {
        if (disabled) return;
        try (var activity = telemetry.start("outbox", "snapshot", "database")) {
            try {
                var rows = new EnumMap<DomainEnums.OutboxStatus, OutboxOrm.TelemetryRow>(DomainEnums.OutboxStatus.class);
                for (var row : orm.telemetrySnapshot()) rows.put(row.status(), row);
                snapshot = new Snapshot(Map.copyOf(rows), Instant.now());
            } catch (RuntimeException exception) { activity.failure(exception); throw exception; }
        }
    }

    @PreDestroy void close() { counts.close(); oldest.close(); freshness.close(); }
}
