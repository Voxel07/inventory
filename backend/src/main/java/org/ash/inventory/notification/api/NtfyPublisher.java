package org.ash.inventory.notification.api;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

/**
 * Publishes to the configured ntfy server; the server URLs and credentials are deployment configuration.
 * {@code ntfy-url} may be plain HTTP so the API reaches an ntfy container over the internal network;
 * {@code ntfy-public-url} is the address users subscribe to and defaults to {@code ntfy-url}.
 */
@ApplicationScoped
public class NtfyPublisher {
    public record Message(String topic, String title, String text, String click, List<String> tags) {
        public Message { tags = List.copyOf(tags); }
    }
    @Inject ObjectMapper json;
    @ConfigProperty(name="inventory.notifications.ntfy-url") Optional<String> server;
    @ConfigProperty(name="inventory.notifications.ntfy-public-url") Optional<String> publicUrl;
    @ConfigProperty(name="inventory.notifications.ntfy-token") Optional<String> token;
    @ConfigProperty(name="inventory.notifications.ntfy-username") Optional<String> username;
    @ConfigProperty(name="inventory.notifications.ntfy-password") Optional<String> password;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    public boolean enabled() { return server.isPresent(); }

    /** The address users subscribe to in the ntfy app. */
    public Optional<String> publicUrl() { return publicUrl.or(() -> server); }

    /** True once the server acknowledged; JSON publishing to the server root keeps UTF-8 text out of HTTP headers. */
    public boolean publish(Message message) throws IOException, InterruptedException {
        var request = HttpRequest.newBuilder(internal(server.orElseThrow())).timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json");
        if (token.isPresent()) request.header("Authorization", "Bearer " + token.get());
        else if (username.isPresent()) request.header("Authorization", "Basic " + Base64.getEncoder()
                .encodeToString((username.get() + ":" + password.orElse("")).getBytes(StandardCharsets.UTF_8)));
        var body = new LinkedHashMap<String, Object>(Map.of("topic", message.topic(), "title", message.title(), "message", message.text(), "tags", message.tags()));
        if (message.click() != null) body.put("click", message.click());
        int status = client.send(request.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),
                HttpResponse.BodyHandlers.discarding()).statusCode();
        return status >= 200 && status < 300;
    }

    /**
     * HTTPS, or plain HTTP to an ntfy container on the internal network: the token or password travels with every post,
     * so HTTP is refused once the host resolves to a public address.
     */
    static URI internal(String endpoint) throws java.net.UnknownHostException {
        var uri = URI.create(endpoint);
        if ("https".equals(uri.getScheme())) return uri;
        if (!"http".equals(uri.getScheme()) || uri.getHost() == null) throw new IllegalArgumentException("ntfy URL requires http or https");
        for (var address : java.net.InetAddress.getAllByName(uri.getHost()))
            if (PersonalWebhookPublisher.isPublic(address)) throw new IllegalArgumentException("Plain-HTTP ntfy URLs must point to an internal host");
        return uri;
    }

    /** Credentials and recipients only travel over HTTPS, except to a gateway on this host. */
    public static URI secure(String endpoint) {
        var uri = URI.create(endpoint);
        if (!"https".equals(uri.getScheme()) && !("http".equals(uri.getScheme()) && Set.of("localhost", "127.0.0.1", "::1").contains(uri.getHost())))
            throw new IllegalArgumentException("Notification endpoint requires HTTPS");
        return uri;
    }
}
