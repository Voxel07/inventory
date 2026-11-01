package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.ash.inventory.blobs.api.BlobStore;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.telemetry.InventoryTelemetry;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.net.URI;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Media storage against a real S3 bucket (Garage, MinIO, AWS). Opt-in: set TEST_S3_ENDPOINT, TEST_S3_BUCKET,
 * TEST_S3_ACCESS_KEY, TEST_S3_SECRET_KEY (and optionally TEST_S3_REGION). Every object is checked in the bucket itself
 * with an independent client, so the API cannot pass by serving a local copy.
 */
@QuarkusTest
@TestProfile(S3MediaIntegrationTest.S3.class)
@EnabledIfEnvironmentVariable(named = "TEST_S3_ENDPOINT", matches = ".+")
class S3MediaIntegrationTest {
    public static class S3 implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() {
            return Map.of("inventory.media.mode", "s3",
                    "inventory.media.s3.endpoint", env("TEST_S3_ENDPOINT"),
                    "inventory.media.s3.bucket", env("TEST_S3_BUCKET"),
                    "inventory.media.s3.region", region(),
                    "inventory.media.s3.access-key", env("TEST_S3_ACCESS_KEY"),
                    "inventory.media.s3.secret-key", env("TEST_S3_SECRET_KEY"),
                    // An unreachable local directory: any accidental local fallback fails instead of passing.
                    "inventory.media.local-directory", "/nonexistent/inventory-media");
        }
    }

    private static final byte[] WEBP = Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
    private static S3Client bucket;

    @Inject InventoryTelemetry telemetry;
    @Inject org.ash.inventory.operations.internal.application.MediaCleanupService cleanup;
    @Inject BlobStore blobs;

    private static String env(String name) { return Optional.ofNullable(System.getenv(name)).orElse(""); }
    private static String region() { return env("TEST_S3_REGION").isBlank() ? "garage" : env("TEST_S3_REGION"); }

    @BeforeAll static void connect() {
        bucket = S3Client.builder().endpointOverride(URI.create(env("TEST_S3_ENDPOINT"))).region(Region.of(region()))
                .httpClientBuilder(UrlConnectionHttpClient.builder())
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(env("TEST_S3_ACCESS_KEY"), env("TEST_S3_SECRET_KEY"))))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).build();
    }

    @AfterAll static void close() { if (bucket != null) bucket.close(); }

    private static RequestSpecification admin() {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "s3-admin").header("X-Actor-Role", "admin");
    }

    private static String upload(byte[] bytes, String name, String type) {
        return given().header("X-Actor-Id", "s3-admin").header("X-Actor-Role", "admin")
                .multiPart("file", name, bytes, type).post("/api/media").then().statusCode(200).extract().path("key");
    }

    private static boolean inBucket(String key) {
        try {
            bucket.headObject(HeadObjectRequest.builder().bucket(env("TEST_S3_BUCKET")).key(key).build());
            return true;
        } catch (NoSuchKeyException missing) {
            return false;
        } catch (S3Exception error) {
            if (error.statusCode() == 404) return false;
            throw error;
        }
    }

    private static byte[] bucketBytes(String key) {
        return bucket.getObject(b -> b.bucket(env("TEST_S3_BUCKET")).key(key), ResponseTransformer.toBytes()).asByteArray();
    }

    /** A valid PNG signature followed by random bytes: passes type sniffing at any size. */
    private static byte[] png(int size, long seed) {
        byte[] bytes = new byte[size];
        new Random(seed).nextBytes(bytes);
        System.arraycopy(new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, 0, bytes, 0, 8);
        return bytes;
    }

    @Test void itemImagesLiveInTheBucketThroughStagingAttachReplaceAndRemoval() {
        String first = upload(WEBP, "a.webp", "image/webp"), second = upload(WEBP, "b.webp", "image/webp");
        assertTrue(inBucket(first) && inBucket(second), "staged uploads must be written to the bucket");
        assertArrayEquals(WEBP, bucketBytes(first));

        var item = admin().body(Map.of("name", "S3 image item", "category", "S3", "value", 0, "images", List.of(first, second)))
                .post("/api/items").then().statusCode(200).extract().jsonPath();
        String id = item.getString("id");
        List<String> images = item.getList("images", String.class);
        assertEquals(2, images.size());
        for (String key : images) {
            assertTrue(key.matches("items/[0-9a-f-]{36}/" + id + "\\.webp"), key);
            assertTrue(inBucket(key), "attached image must be copied to its canonical key: " + key);
            assertArrayEquals(WEBP, bucketBytes(key));
            assertArrayEquals(WEBP, admin().get("/api/media/" + key).then().statusCode(200).contentType("image/webp")
                    .header("Content-Length", String.valueOf(WEBP.length)).extract().asByteArray());
        }
        assertFalse(inBucket(first), "staged object must be removed after attaching");
        assertFalse(inBucket(second), "staged object must be removed after attaching");
        admin().get("/api/media/" + first).then().statusCode(404);

        admin().body(Map.of("name", "S3 image item", "category", "S3", "value", 0, "images", List.of(images.get(1))))
                .patch("/api/items/" + id).then().statusCode(200).body("images", equalTo(List.of(images.get(1))));
        assertFalse(inBucket(images.get(0)), "a removed image must be deleted from the bucket");
        assertTrue(inBucket(images.get(1)));
        admin().get("/api/media/" + images.get(0)).then().statusCode(404);
    }

    @Test void abandonedStagedUploadIsDeletedFromTheBucketByTheCleanupWorker() {
        String staged = upload(WEBP, "abandoned.webp", "image/webp");
        assertTrue(inBucket(staged));
        admin().delete("/api/media/" + staged).then().statusCode(204);
        admin().get("/api/media/" + staged).then().statusCode(404);
        // Deleting a staged upload queues a due cleanup job; the media worker removes the object.
        for (int i = 0; i < 500 && inBucket(staged); i++) {
            var claim = cleanup.claim();
            if (claim == null) break;
            blobs.delete(claim.key());
            cleanup.complete(claim);
        }
        assertFalse(inBucket(staged), "the cleanup worker must delete the abandoned object from the bucket");
    }

    @Test void largeUploadsRoundTripByteForByteAndOversizedOnesNeverReachTheBucket() {
        byte[] large = png(9 * 1024 * 1024, 7);
        String key = upload(large, "large.png", "image/png");
        assertArrayEquals(large, bucketBytes(key));
        assertArrayEquals(large, admin().get("/api/media/" + key).then().statusCode(200).contentType("image/png").extract().asByteArray());
        admin().delete("/api/media/" + key).then().statusCode(204);

        var before = bucket.listObjectsV2(b -> b.bucket(env("TEST_S3_BUCKET"))).keyCount();
        given().header("X-Actor-Id", "s3-admin").header("X-Actor-Role", "admin")
                .multiPart("file", "huge.png", png(10 * 1024 * 1024 + 1, 8), "image/png").post("/api/media")
                .then().statusCode(413);
        assertEquals(before, bucket.listObjectsV2(b -> b.bucket(env("TEST_S3_BUCKET"))).keyCount());
    }

    @Test void concurrentUploadsAndDownloadsStayIsolated() throws Exception {
        int callers = 12;
        try (var pool = Executors.newFixedThreadPool(callers)) {
            var tasks = new ArrayList<Callable<Boolean>>();
            for (int i = 0; i < callers; i++) {
                int seed = i;
                tasks.add(() -> {
                    byte[] bytes = png(256 * 1024 + seed, seed);
                    String actor = "s3-concurrent-" + seed;
                    String key = given().header("X-Actor-Id", actor).header("X-Actor-Role", "admin")
                            .multiPart("file", "c.png", bytes, "image/png").post("/api/media").then().statusCode(200).extract().path("key");
                    byte[] served = given().header("X-Actor-Id", actor).header("X-Actor-Role", "admin")
                            .get("/api/media/" + key).then().statusCode(200).extract().asByteArray();
                    boolean stored = java.util.Arrays.equals(bytes, bucketBytes(key));
                    given().header("X-Actor-Id", actor).header("X-Actor-Role", "admin").delete("/api/media/" + key).then().statusCode(204);
                    return java.util.Arrays.equals(bytes, served) && stored;
                });
            }
            for (var result : pool.invokeAll(tasks)) assertTrue(result.get());
        }
    }

    @Test void storageFailuresAreReportedWithoutLeakingDetails() {
        var wrongSecret = new BlobStore(telemetry, "s3", "/nonexistent", env("TEST_S3_ENDPOINT"), env("TEST_S3_BUCKET"), region(),
                Optional.of(env("TEST_S3_ACCESS_KEY")), Optional.of("wrong-secret"));
        var denied = assertThrows(ApiException.class, () -> wrongSecret.store("x.webp", "image/webp", WEBP));
        assertEquals(502, denied.status);
        assertTrue(denied.getMessage().contains("access denied"), denied.getMessage());

        var missingBucket = new BlobStore(telemetry, "s3", "/nonexistent", env("TEST_S3_ENDPOINT"), "missing-" + System.nanoTime(), region(),
                Optional.of(env("TEST_S3_ACCESS_KEY")), Optional.of(env("TEST_S3_SECRET_KEY")));
        assertEquals(502, assertThrows(ApiException.class, () -> missingBucket.store("x.webp", "image/webp", WEBP)).status);

        var unreachable = new BlobStore(telemetry, "s3", "/nonexistent", "http://127.0.0.1:9", env("TEST_S3_BUCKET"), region(),
                Optional.of(env("TEST_S3_ACCESS_KEY")), Optional.of(env("TEST_S3_SECRET_KEY")));
        var down = assertThrows(ApiException.class, () -> unreachable.read("2026-" + java.util.UUID.randomUUID() + "-x.webp"));
        assertEquals(502, down.status);
        assertEquals("Object storage is unavailable", down.getMessage());

        var unconfigured = new BlobStore(telemetry, "s3", "/nonexistent", env("TEST_S3_ENDPOINT"), env("TEST_S3_BUCKET"), region(),
                Optional.empty(), Optional.empty());
        assertEquals(503, assertThrows(ApiException.class, () -> unconfigured.store("x.webp", "image/webp", WEBP)).status);

        admin().get("/api/media/2026-" + java.util.UUID.randomUUID() + "-missing.webp").then().statusCode(404);
    }
}
