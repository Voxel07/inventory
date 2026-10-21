package org.ash.inventory.integration.internal;
import org.ash.inventory.platform.telemetry.InventoryTelemetry;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.integration.api.OutboxStatus;
import org.ash.inventory.integration.internal.DomainEvent;
import org.ash.inventory.integration.internal.OutboxTelemetry;

import com.sun.net.httpserver.HttpServer;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.*;

/** Boots real Quarkus exporters against a local OTLP receiver, using an isolated PostgreSQL schema. */
@QuarkusTest
@TestProfile(TelemetryExportTest.Isolated.class)
@QuarkusTestResource(value = TelemetryExportTest.Receiver.class, restrictToAnnotatedClass = true)
class TelemetryExportTest {
    public static class Isolated implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() {
            return Map.ofEntries(
                    Map.entry("quarkus.hibernate-orm.schema-management.strategy", "validate"),
                    Map.entry("quarkus.hibernate-orm.database.default-schema", "inventory_telemetry_test"),
                    Map.entry("quarkus.datasource.jdbc.additional-jdbc-properties.currentSchema", "inventory_telemetry_test"),
                    Map.entry("quarkus.flyway.schemas", "inventory_telemetry_test"),
                    Map.entry("quarkus.flyway.migrate-at-start", "true"),
                    Map.entry("quarkus.flyway.clean-at-start", "true"),
                    Map.entry("quarkus.flyway.clean-disabled", "false"),
                    Map.entry("quarkus.scheduler.enabled", "false"),
                    Map.entry("quarkus.oidc.tenant-enabled", "false"),
                    Map.entry("inventory.events.backend", "memory"));
        }
    }
    @Inject InventoryTelemetry telemetry;
    @Inject io.agroal.api.AgroalDataSource datasource;
    @Inject jakarta.persistence.EntityManager entityManager;
    @Inject org.ash.inventory.integration.api.DomainEventService events;
    @Inject OutboxTelemetry outbox;
    @ConfigProperty(name = "test.telemetry.receiver.port") int receiverPort;

    @Test void exportsAllSignalsWithResourceIdentityAndDurableTraceCorrelation() throws Exception {
        var carrier = new LinkedHashMap<String, String>();
        String trace;
        try (var activity = telemetry.start("sync", "transaction", "database")) {
            trace = Span.current().getSpanContext().getTraceId();
            assertTrue(Span.current().getSpanContext().isSampled());
            carrier.putAll(telemetry.captureTraceContext());
            assertFalse(carrier.containsKey("baggage"));
            verifyCommittedEvents(trace);
            activity.outcome("applied");
        }
        var parent = telemetry.restoreTraceContext(carrier);
        try (var activity = telemetry.start("outbox", "deliver", "event_bus", parent, SpanKind.CONSUMER)) {
            assertEquals(trace, Span.current().getSpanContext().getTraceId());
            activity.failure(new IllegalStateException("telemetry regression probe"));
        }
        given().get("/q/health").then().statusCode(200);
        assertTrue(datasource.getMetrics().acquireCount() > 0, "Pool metrics must collect real connection acquisitions");
        Map<String, Object> received = Map.of();
        long deadline = System.nanoTime() + java.time.Duration.ofSeconds(15).toNanos();
        while (System.nanoTime() < deadline) {
            received = given().port(receiverPort).queryParam("trace", trace).get("/received").jsonPath().getMap("$");
            if (received.values().stream().allMatch(Boolean.TRUE::equals)) break;
            Thread.sleep(100);
        }
        assertFalse(received.isEmpty());
        assertTrue(received.values().stream().allMatch(Boolean.TRUE::equals), received.toString());
    }

    private void verifyCommittedEvents(String trace) throws Exception {
        var eventId = io.quarkus.narayana.jta.QuarkusTransaction.requiringNew().call(() ->
                events.record("telemetry.committed", "probe", java.util.UUID.randomUUID(), null, null, Map.of()));
        var event=io.quarkus.narayana.jta.QuarkusTransaction.requiringNew().call(() -> entityManager.createQuery("from DomainEvent where eventId=:id",DomainEvent.class).setParameter("id",eventId).getSingleResult());
        assertTrue(event.traceContext.get("traceparent").contains(trace));
        assertFalse(event.traceContext.containsKey("baggage"));
        assertThrows(IllegalStateException.class, () -> io.quarkus.narayana.jta.QuarkusTransaction.requiringNew().run(() -> {
            events.record("telemetry.rolled_back", "probe", java.util.UUID.randomUUID(), null, null, Map.of());
            throw new IllegalStateException("rollback probe");
        }));
        long rejected = io.quarkus.narayana.jta.QuarkusTransaction.requiringNew().call(() -> entityManager.createQuery(
                "select count(e) from DomainEvent e where e.eventType = 'telemetry.rolled_back'", Long.class).getSingleResult());
        assertEquals(0, rejected);
        var terminal = io.quarkus.narayana.jta.QuarkusTransaction.requiringNew().call(() -> {
            var id = events.record("telemetry.terminal", "probe", java.util.UUID.randomUUID(), null, null, Map.of());
            var value=entityManager.createQuery("from DomainEvent where eventId=:id",DomainEvent.class).setParameter("id",id).getSingleResult();
            value.status = org.ash.inventory.integration.api.OutboxStatus.published;
            value.publishedAt = java.time.Instant.now();
            return value.id;
        });
        events.failed(terminal, "late delivery failure");
        var status = io.quarkus.narayana.jta.QuarkusTransaction.requiringNew().call(() ->
                entityManager.find(org.ash.inventory.integration.internal.DomainEvent.class, terminal).status);
        assertEquals(org.ash.inventory.integration.api.OutboxStatus.published, status);
        outbox.refresh();
    }

    public static class Receiver implements QuarkusTestResourceLifecycleManager {
        private record Request(byte[] body, String authorization, String stream) {}
        private final Map<String, CopyOnWriteArrayList<Request>> requests = new ConcurrentHashMap<>();
        private HttpServer server;

        @Override public Map<String, String> start() {
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
                server.createContext("/api/default/v1/", exchange -> {
                    String signal = exchange.getRequestURI().getPath().substring("/api/default/v1/".length());
                    requests.computeIfAbsent(signal, ignored -> new CopyOnWriteArrayList<>()).add(new Request(
                            exchange.getRequestBody().readAllBytes(), exchange.getRequestHeaders().getFirst("Authorization"),
                            exchange.getRequestHeaders().getFirst("stream-name")));
                    exchange.getResponseHeaders().set("Content-Type", "application/x-protobuf");
                    exchange.sendResponseHeaders(200, -1);
                    exchange.close();
                });
                server.createContext("/received", exchange -> {
                    String trace = exchange.getRequestURI().getRawQuery().substring("trace=".length());
                    byte[] traceBytes = HexFormat.of().parseHex(trace);
                    boolean traces = has("traces", traceBytes, "inventory.outbox.deliver");
                    boolean logs = has("logs", traceBytes, "telemetry regression probe");
                    boolean metrics = has("metrics", new byte[0], "inventory.operation.count")
                            && has("metrics", new byte[0], "jvm.memory.used")
                            && has("metrics", new byte[0], "inventory.outbox.entries")
                            && has("metrics", new byte[0], "telemetry.committed")
                            && !has("metrics", new byte[0], "telemetry.rolled_back");
                    boolean auth = requests.values().stream().flatMap(java.util.Collection::stream)
                            .allMatch(r -> "Basic dGVzdDpwYXNzd29yZA==".equals(r.authorization()));
                    boolean stream = requests.getOrDefault("logs", new CopyOnWriteArrayList<>()).stream()
                            .allMatch(r -> "inventory_backend".equals(r.stream()));
                    var body = ("{\"traces\":" + traces + ",\"logs\":" + logs + ",\"metrics\":" + metrics
                            + ",\"auth\":" + auth + ",\"stream\":" + stream + "}").getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, body.length);
                    exchange.getResponseBody().write(body);
                    exchange.close();
                });
                server.start();
                int port = server.getAddress().getPort();
                return Map.ofEntries(
                        Map.entry("test.telemetry.receiver.port", Integer.toString(port)),
                        Map.entry("quarkus.otel.sdk.disabled", "false"),
                        Map.entry("quarkus.otel.exporter.otlp.endpoint", "http://127.0.0.1:" + port + "/api/default"),
                        Map.entry("quarkus.otel.exporter.otlp.headers", "Authorization=Basic dGVzdDpwYXNzd29yZA=="),
                        Map.entry("quarkus.otel.exporter.otlp.logs.headers", "Authorization=Basic dGVzdDpwYXNzd29yZA==,stream-name=inventory_backend"),
                        Map.entry("inventory.telemetry.token", "dGVzdDpwYXNzd29yZA=="),
                        Map.entry("inventory.telemetry.version", "telemetry-test"),
                        Map.entry("inventory.telemetry.instance-id", "telemetry-test-instance"),
                        Map.entry("quarkus.otel.metric.export.interval", "100ms"),
                        Map.entry("quarkus.otel.bsp.schedule.delay", "100ms"),
                        Map.entry("quarkus.otel.blrp.schedule.delay", "100ms"));
            } catch (java.io.IOException exception) { throw new IllegalStateException(exception); }
        }

        private boolean has(String signal, byte[] trace, String text) {
            return requests.getOrDefault(signal, new CopyOnWriteArrayList<>()).stream().anyMatch(request -> {
                String body = new String(request.body(), StandardCharsets.ISO_8859_1);
                return body.contains(new String(trace, StandardCharsets.ISO_8859_1)) && body.contains(text)
                        && body.contains("telemetry-test-instance") && body.contains("telemetry-test");
            });
        }
        @Override public void stop() { if (server != null) server.stop(0); }
    }
}
