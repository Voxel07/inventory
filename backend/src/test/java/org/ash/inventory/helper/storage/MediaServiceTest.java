package org.ash.inventory.helper.storage;

import com.sun.net.httpserver.HttpServer;
import org.ash.inventory.resource.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class MediaServiceTest {
    @TempDir Path directory;

    private MediaService service() {
        var media = new MediaService();
        media.mode = "local";
        media.localDirectory = directory.toString();
        media.endpoint = "http://garage:3900";
        media.bucket = "inventory";
        media.region = "garage";
        media.accessKey = Optional.of("test-key");
        media.secretKey = Optional.of("test-secret");
        return media;
    }

    @Test
    void localMediaHasAnImageContentTypeAndRejectsTraversal() {
        var media = service();
        byte[] bytes = {1, 2, 3};
        var stored = media.store("image.webp", "image/webp", bytes);
        assertNull(stored.url());
        assertArrayEquals(bytes, media.read(stored.key()).bytes());
        assertEquals("image/webp", media.read(stored.key()).contentType());
        assertEquals(400, assertThrows(ApiException.class, () -> media.read("../outside")).status);
        assertEquals(400, assertThrows(ApiException.class, () -> media.read("items/../outside")).status);
        assertEquals(404, assertThrows(ApiException.class, () -> media.read("missing.webp")).status);
    }

    @Test
    void acceptsOnlyCanonicalObjectKeys() {
        var media = service();
        assertEquals("items/one/image.webp", media.mediaReference("items/one/image.webp"));
        assertEquals("image.webp", media.mediaReference("image.webp"));
        assertEquals(400, assertThrows(ApiException.class,
                () -> media.mediaReference("https://images.example.test/image.webp")).status);
        assertEquals(400, assertThrows(ApiException.class,
                () -> media.mediaReference("http://garage:3900/inventory/image.webp")).status);
        assertNull(media.mediaReference(null));
    }

    @Test
    void privateS3ReadsUseSignedRequestsAndReturnImageBytes() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var authorization = new AtomicReference<String>();
        var method = new AtomicReference<String>();
        var path = new AtomicReference<String>();
        byte[] bytes = "stored-image".getBytes(StandardCharsets.UTF_8);
        server.createContext("/", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            method.set(exchange.getRequestMethod());
            path.set(exchange.getRequestURI().getRawPath());
            exchange.getResponseHeaders().add("Content-Type", "image/webp");
            exchange.sendResponseHeaders(exchange.getRequestURI().getPath().endsWith("missing.webp") ? 404 : 200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            var media = service();
            media.mode = "s3";
            media.endpoint = "http://127.0.0.1:" + server.getAddress().getPort();
            var content = media.read("items/one/a b.webp");
            assertEquals("GET", method.get());
            assertEquals("/inventory/items/one/a%20b.webp", path.get());
            assertTrue(authorization.get().startsWith("AWS4-HMAC-SHA256 Credential=test-key/"));
            assertTrue(authorization.get().matches(".*Signature=[0-9a-f]{64}"));
            assertArrayEquals(bytes, content.bytes());
            assertEquals("image/webp", content.contentType());
            assertEquals(404, assertThrows(ApiException.class, () -> media.read("missing.webp")).status);
        } finally {
            server.stop(0);
        }
    }
}
