package org.ash.inventory.helper.telemetry;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.metrics.DoubleHistogram;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.LongUpDownCounter;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.TextMapGetter;
import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.resource.ApiException;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/** Instrument names and metric dimensions come from code, never request payloads or individual IDs. */
@ApplicationScoped
public class InventoryTelemetry {
    private static final Logger LOG = Logger.getLogger(InventoryTelemetry.class);
    private static final Set<String> SYNC_OPERATIONS = Set.of("order.create", "transaction", "order.prepare",
            "order.transition", "order.return", "damage.create", "count.submit", "count.recount", "transfer.receive", "return.accept", "member.return");
    private final Meter meter;
    private final Tracer tracer;
    private final Map<String, LongCounter> counters = new ConcurrentHashMap<>();
    private final Map<String, DoubleHistogram> histograms = new ConcurrentHashMap<>();
    private final LongUpDownCounter streams;
    private static final TextMapGetter<Map<String, String>> TRACE_GETTER = new TextMapGetter<>() {
        public Iterable<String> keys(Map<String, String> carrier) { return carrier.keySet(); }
        public String get(Map<String, String> carrier, String key) { return carrier.get(key); }
    };

    public InventoryTelemetry(OpenTelemetry openTelemetry) {
        this.meter = openTelemetry.getMeter("org.ash.inventory");
        this.tracer = openTelemetry.getTracer("org.ash.inventory");
        streams = meter.upDownCounterBuilder("inventory.sse.active").setUnit("{connection}").build();
    }

    public Meter meter() { return meter; }
    public Map<String, String> captureTraceContext() {
        var carrier = new java.util.LinkedHashMap<String, String>();
        W3CTraceContextPropagator.getInstance().inject(Context.current(), carrier, Map::put);
        return carrier;
    }
    public Context restoreTraceContext(Map<String, String> carrier) {
        return W3CTraceContextPropagator.getInstance().extract(Context.root(), carrier, TRACE_GETTER);
    }
    public static String syncOperation(String value) { return SYNC_OPERATIONS.contains(value) ? value : "unknown"; }
    public static double ageSeconds(Instant value) {
        if (value == null) return 0;
        var age = Duration.between(value, Instant.now());
        return Math.max(0, age.getSeconds() + age.getNano() / 1_000_000_000.0);
    }
    public static Attributes dimensions(String operation, String outcome) {
        return Attributes.builder().put("operation", operation).put("outcome", outcome).build();
    }

    public void count(String name, long value, Attributes attributes) {
        counters.computeIfAbsent(name, key -> meter.counterBuilder(key).build()).add(value, attributes);
    }
    public void measure(String name, double value, String unit, Attributes attributes) {
        histograms.computeIfAbsent(name, key -> meter.histogramBuilder(key).setUnit(unit).build()).record(value, attributes);
    }
    public void streamOpened() {
        streams.add(1);
        count("inventory.sse.connections", 1, dimensions("connect", "success"));
    }
    public void streamClosed(String reason, long started) {
        streams.add(-1);
        var attributes = dimensions("disconnect", reason);
        count("inventory.sse.connections", 1, attributes);
        measure("inventory.sse.lifetime", (System.nanoTime() - started) / 1_000_000_000.0, "s", attributes);
        LOG.debugf("component=sse operation=disconnect outcome=%s", reason);
    }

    public Activity start(String component, String operation, String backend) {
        return start(component, operation, backend, Context.current(), SpanKind.INTERNAL);
    }
    public Activity start(String component, String operation, String backend, Context parent, SpanKind kind) {
        var span = tracer.spanBuilder("inventory." + component + "." + operation).setParent(parent).setSpanKind(kind)
                .setAttribute("inventory.component", component).setAttribute("inventory.operation", operation)
                .setAttribute("inventory.backend", backend).startSpan();
        return new Activity(component, operation, backend, span);
    }
    public <T> T call(String component, String operation, String backend, Supplier<T> action) {
        try (var activity = start(component, operation, backend)) {
            try { return action.get(); }
            catch (RuntimeException exception) { activity.failure(exception); throw exception; }
        }
    }

    public final class Activity implements AutoCloseable {
        private final String component, operation, backend;
        private final Span span;
        private final Scope scope;
        private final long started = System.nanoTime();
        private String outcome = "success";
        private Throwable failure;

        private Activity(String component, String operation, String backend, Span span) {
            this.component = component;
            this.operation = operation;
            this.backend = backend;
            this.span = span;
            this.scope = span.makeCurrent();
        }
        public Activity attribute(String name, String value) { if (value != null) span.setAttribute(name, value); return this; }
        public Activity attribute(String name, long value) { span.setAttribute(name, value); return this; }
        public void outcome(String value) { outcome = value; }
        public String outcome() { return outcome; }
        public void failure(Throwable exception) {
            failure = exception;
            span.setAttribute("error.type", exception.getClass().getName());
            if (exception instanceof ApiException api) span.setAttribute("inventory.error.status", api.status);
            outcome = exception instanceof ApiException api && api.status < 500
                    ? (api.status == 409 ? "conflict" : api.status == 404 ? "not_found" : "rejected") : "error";
            if (outcome.equals("error")) {
                span.recordException(exception);
                span.setStatus(StatusCode.ERROR, exception.getClass().getSimpleName());
            }
        }
        @Override public void close() {
            try {
                double elapsed = (System.nanoTime() - started) / 1_000_000_000.0;
                span.setAttribute("inventory.outcome", outcome);
                var attributes = Attributes.builder().put("component", component).put("operation", operation)
                        .put("backend", backend).put("outcome", outcome).build();
                count("inventory.operation.count", 1, attributes);
                measure("inventory.operation.duration", elapsed, "s", attributes);
                if (failure != null && outcome.equals("error")) {
                    LOG.errorf(failure, "component=%s operation=%s backend=%s outcome=%s trace_id=%s span_id=%s",
                            component, operation, backend, outcome, span.getSpanContext().getTraceId(), span.getSpanContext().getSpanId());
                } else {
                    LOG.debugf("component=%s operation=%s backend=%s outcome=%s duration_ms=%.3f trace_id=%s span_id=%s",
                            component, operation, backend, outcome, elapsed * 1000,
                            span.getSpanContext().getTraceId(), span.getSpanContext().getSpanId());
                }
            } finally { scope.close(); span.end(); }
        }
    }
}
