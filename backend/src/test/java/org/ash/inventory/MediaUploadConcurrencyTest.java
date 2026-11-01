package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Base64;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;

/** Regression: each upload once held a pooled connection while waiting for a second one, stalling the pool. */
@QuarkusTest
class MediaUploadConcurrencyTest {
    private static final byte[] WEBP = Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");

    @ConfigProperty(name = "quarkus.datasource.jdbc.max-size") int poolSize;

    @Test void moreConcurrentUploadsThanPooledConnectionsAllSucceedPromptly() throws Exception {
        int callers = poolSize * 3;
        long started = System.nanoTime();
        try (var pool = Executors.newFixedThreadPool(callers)) {
            var tasks = new ArrayList<Callable<Integer>>();
            for (int i = 0; i < callers; i++) {
                String actor = "upload-concurrency-" + i;
                tasks.add(() -> given().header("X-Actor-Id", actor).header("X-Actor-Role", "admin")
                        .multiPart("file", "image.webp", WEBP, "image/webp").post("/api/media").statusCode());
            }
            for (var status : pool.invokeAll(tasks)) assertEquals(200, status.get());
        }
        // A pool deadlock only resolves through the 10 s acquisition timeout.
        long seconds = (System.nanoTime() - started) / 1_000_000_000L;
        org.junit.jupiter.api.Assertions.assertTrue(seconds < 8, "uploads took " + seconds + " s");
    }
}
