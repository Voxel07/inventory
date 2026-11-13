package org.ash.inventory.notification.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.http.HttpClient;
import io.vertx.core.http.HttpClientRequest;
import io.vertx.core.http.HttpClientResponse;
import io.vertx.core.http.RequestOptions;
import org.junit.jupiter.api.Test;

import javax.net.ssl.SSLHandshakeException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;

class PersonalWebhookPublisherTest {
    private static final String SECRET_URL = "https://1.1.1.1/webhook/secret-token?key=private";
    private static final String LINK = "https://inventory.example.org/profile";

    @Test void hookshotReceivesTitleDetailsAndLinkWithTheIdempotencyKey() throws Exception {
        var receiver = new Receiver(204);
        UUID id = UUID.randomUUID();
        assertTrue(receiver.publisher.publish(SECRET_URL, id, "Order ready", "Collect at shelf A", LINK));
        var body = new ObjectMapper().readTree(receiver.body);
        assertEquals("Order ready\n\nCollect at shelf A\n\n" + LINK, body.get("text").asText());
        assertEquals(body.get("text"), body.get("content"));
        assertEquals(id.toString(), body.get("id").asText());
        assertEquals(id.toString(), receiver.headers.get("Idempotency-Key"));
        assertEquals("application/json", receiver.headers.get("Content-Type"));
        assertEquals("/webhook/secret-token?key=private", receiver.options.getURI());
        assertEquals("1.1.1.1", receiver.options.getServer().host());
        assertEquals(Boolean.FALSE, receiver.options.getFollowRedirects());
        assertTrue(receiver.closed);
    }

    @Test void httpRejectionsAndRedirectsReportTheStatusWithoutExposingTheSecretUrl() {
        for (int status : new int[] {301, 400, 404, 429, 500}) {
            var receiver = new Receiver(status);
            var error = assertThrows(PersonalWebhookPublisher.DeliveryException.class,
                    () -> receiver.publisher.publish(SECRET_URL, UUID.randomUUID(), "Test", "Test", LINK));
            assertEquals("Webhook endpoint returned HTTP " + status, error.getMessage());
            assertNull(error.getCause());
            assertTrue(receiver.closed);
        }
    }

    @Test void connectionFailuresExposeOnlyAnActionableCategory() {
        var failures = Map.of(
                new SSLHandshakeException(SECRET_URL), "TLS connection failed",
                new ConnectException(SECRET_URL), "connection failed",
                new UnknownHostException(SECRET_URL), "host could not be resolved",
                new TimeoutException(SECRET_URL), "request timed out");
        for (var entry : failures.entrySet()) {
            var error = PersonalWebhookPublisher.failure(new ExecutionException(entry.getKey()));
            assertTrue(error.getMessage().contains(entry.getValue()));
            assertFalse(error.getMessage().contains("secret-token"));
            assertNull(error.getCause());
        }
        assertEquals("Webhook request failed", PersonalWebhookPublisher.failure(new RuntimeException(SECRET_URL)).getMessage());
    }

    @Test void identicalTitleAndDetailsAreNotRepeated() {
        assertEquals("Test\n\n" + LINK,
                PersonalWebhookPublisher.payload(UUID.randomUUID(), "Test", "Test", LINK).get("text"));
    }

    /** No sockets are opened: capture the real publisher's HTTP request and supply an acknowledgement. */
    private static final class Receiver {
        final PersonalWebhookPublisher publisher = new PersonalWebhookPublisher();
        final Map<String, String> headers = new HashMap<>();
        RequestOptions options;
        String body;
        boolean closed;

        Receiver(int status) {
            HttpClientResponse response = stub(HttpClientResponse.class, (method, args) -> {
                if (method.getName().equals("statusCode")) return status;
                throw new AssertionError(method);
            });
            HttpClientRequest request = stub(HttpClientRequest.class, (method, args) -> {
                if (method.getName().equals("putHeader")) { headers.put(args[0].toString(), args[1].toString()); return null; }
                if (method.getName().equals("send")) { body = ((Buffer) args[0]).toString(); return Future.succeededFuture(response); }
                throw new AssertionError(method);
            });
            HttpClient client = stub(HttpClient.class, (method, args) -> {
                if (method.getName().equals("request")) { options = (RequestOptions) args[0]; return Future.succeededFuture(request); }
                if (method.getName().equals("close")) { closed = true; return Future.succeededFuture(); }
                throw new AssertionError(method);
            });
            publisher.json = new ObjectMapper();
            publisher.vertx = stub(Vertx.class, (method, args) -> {
                if (method.getName().equals("createHttpClient")) return client;
                throw new AssertionError(method);
            });
        }
    }

    private static <T> T stub(Class<T> type, BiFunction<Method, Object[], Object> call) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, (proxy, method, args) -> {
            Object result = call.apply(method, args);
            return result == null && method.getReturnType().isInstance(proxy) ? proxy : result;
        }));
    }
}
