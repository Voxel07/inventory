package org.ash.inventory.reporting.internal;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

/**
 * A stale read queues its rebuild after the read transaction, holding at most one pooled connection at a time.
 * Nested transactions let concurrent stale reads each hold one connection while waiting for a second.
 */
@QuarkusTest
@TestProfile(ReportReadPoolTest.TwoConnections.class)
class ReportReadPoolTest {
    public static class TwoConnections implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() {
            return Map.of("quarkus.datasource.jdbc.max-size", "2", "quarkus.datasource.jdbc.acquisition-timeout", "5",
                    "quarkus.scheduler.enabled", "false");
        }
    }

    @Test void concurrentStaleReadsDoNotExhaustThePool() {
        try (var threads = Executors.newFixedThreadPool(6)) {
            var reads = IntStream.range(0, 6).mapToObj(i -> CompletableFuture.runAsync(() ->
                    given().header("X-Actor-Id", "report-pool-admin").header("X-Actor-Role", "admin")
                            .get("/api/reports/availability").then().statusCode(200)
                            .body("stale", equalTo(true)).body("job.state", equalTo("pending")), threads)).toList();
            reads.forEach(CompletableFuture::join);
        }
    }
}
