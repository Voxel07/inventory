package org.ash.inventory.platform.telemetry;

import io.agroal.api.AgroalDataSource;
import io.opentelemetry.api.metrics.ObservableDoubleGauge;
import io.opentelemetry.api.metrics.ObservableLongGauge;
import io.opentelemetry.api.metrics.ObservableLongCounter;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
@io.quarkus.runtime.Startup
public class DatabasePoolTelemetry {
    @Inject AgroalDataSource datasource;
    @Inject InventoryTelemetry telemetry;
    private ObservableLongGauge active, available, waiting;
    private ObservableLongCounter acquired, invalid, leaks;
    private ObservableDoubleGauge waitAverage, waitMax;

    @PostConstruct void initialize() {
        var metrics = datasource.getMetrics();
        var meter = telemetry.meter();
        active = meter.gaugeBuilder("inventory.db.pool.active").ofLongs().buildWithCallback(m -> m.record(metrics.activeCount()));
        available = meter.gaugeBuilder("inventory.db.pool.available").ofLongs().buildWithCallback(m -> m.record(metrics.availableCount()));
        waiting = meter.gaugeBuilder("inventory.db.pool.waiting").ofLongs().buildWithCallback(m -> m.record(metrics.awaitingCount()));
        acquired = meter.counterBuilder("inventory.db.pool.acquisitions").buildWithCallback(m -> m.record(metrics.acquireCount()));
        invalid = meter.counterBuilder("inventory.db.pool.invalid").buildWithCallback(m -> m.record(metrics.invalidCount()));
        leaks = meter.counterBuilder("inventory.db.pool.leaks").buildWithCallback(m -> m.record(metrics.leakDetectionCount()));
        waitAverage = meter.gaugeBuilder("inventory.db.pool.wait.average").setUnit("s")
                .buildWithCallback(m -> m.record(metrics.blockingTimeAverage().toNanos() / 1_000_000_000.0));
        waitMax = meter.gaugeBuilder("inventory.db.pool.wait.max").setUnit("s")
                .buildWithCallback(m -> m.record(metrics.blockingTimeMax().toNanos() / 1_000_000_000.0));
    }
    @PreDestroy void close() {
        active.close(); available.close(); waiting.close(); acquired.close(); invalid.close(); leaks.close();
        waitAverage.close(); waitMax.close();
    }
}
