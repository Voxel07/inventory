package org.ash.inventory.notification.api;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

/**
 * Posts to a webhook URL the recipient chose on their profile. Users pick the target, so only HTTPS URLs whose
 * host resolves to public addresses are accepted, checked again before every post, and redirects are never followed.
 */
@ApplicationScoped
public class PersonalWebhookPublisher {
    public static final int MAX_LENGTH = 2048;
    @Inject ObjectMapper json;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    /** True once the webhook acknowledged; Slack-style receivers read {@code text}, Discord-style ones {@code content}. */
    public boolean publish(String url, UUID id, String subject, String text, String link) throws IOException, InterruptedException {
        var request = HttpRequest.newBuilder(URI.create(validate(url))).timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json").header("Idempotency-Key", id.toString());
        String body = json.writeValueAsString(Map.of("id", id, "subject", subject, "text", text, "content", text + "\n" + link, "url", link));
        int status = client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.discarding()).statusCode();
        return status >= 200 && status < 300;
    }

    /** The normalized URL; {@link IllegalArgumentException} names the problem without echoing the URL. */
    public static String validate(String url) {
        URI uri;
        try { uri = new URI(url.trim()); } catch (URISyntaxException invalid) { throw new IllegalArgumentException("Webhook URL is not a valid URL"); }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) throw new IllegalArgumentException("Webhook URL must start with https://");
        if (uri.getRawUserInfo() != null) throw new IllegalArgumentException("Webhook URL must not contain credentials");
        if (uri.toString().length() > MAX_LENGTH) throw new IllegalArgumentException("Webhook URL is too long");
        InetAddress[] addresses;
        try { addresses = InetAddress.getAllByName(uri.getHost()); }
        catch (UnknownHostException unknown) { throw new IllegalArgumentException("Webhook host could not be resolved"); }
        for (var address : addresses) if (!isPublic(address)) throw new IllegalArgumentException("Webhook host must be a public internet address");
        return uri.toString();
    }

    /** Rejects loopback, private, link-local, carrier-grade NAT, unique-local and multicast ranges. */
    static boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] raw = address.getAddress();
        if (address instanceof Inet4Address) return raw[0] != 0 && !((raw[0] & 0xff) == 100 && (raw[1] & 0xc0) == 64);
        return (raw[0] & 0xfe) != 0xfc;
    }
}
