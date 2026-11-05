package org.ash.inventory.notification.api;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.*;
import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.http.HttpClientOptions;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.http.RequestOptions;
import io.vertx.core.net.SocketAddress;

/**
 * Posts to a webhook URL the recipient chose on their profile. Users pick the target, so only HTTPS URLs whose
 * host resolves to public addresses are accepted, checked again before every post, and redirects are never followed.
 */
@ApplicationScoped
public class PersonalWebhookPublisher {
    public static final int MAX_LENGTH = 2048;
    @Inject ObjectMapper json;
    @Inject Vertx vertx;

    /** True once the webhook acknowledged; Slack-style receivers read {@code text}, Discord-style ones {@code content}. */
    public boolean publish(String url, UUID id, String subject, String text, String link) throws IOException, InterruptedException {
        var target = target(url);
        var uri = target.uri();
        int port = uri.getPort() == -1 ? 443 : uri.getPort();
        String path = uri.getRawPath().isEmpty() ? "/" : uri.getRawPath();
        if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();
        // Keep the original host for Host/SNI/certificate verification, but connect only to the checked IP.
        var options = new RequestOptions().setMethod(HttpMethod.POST).setSsl(true).setHost(uri.getHost())
                .setPort(port).setURI(path).setFollowRedirects(false).setTimeout(10_000)
                .setServer(SocketAddress.inetSocketAddress(port, target.address().getHostAddress()));
        String body = json.writeValueAsString(Map.of("id", id, "subject", subject, "text", text, "content", text + "\n" + link, "url", link));
        var client = vertx.createHttpClient(new HttpClientOptions().setConnectTimeout(5_000)
                .setVerifyHost(true).setTrustAll(false).setKeepAlive(false).setMaxHeaderSize(8192));
        try {
            int status = client.request(options).compose(request -> request.putHeader("Content-Type", "application/json")
                    .putHeader("Idempotency-Key", id.toString()).send(Buffer.buffer(body)))
                    .map(response -> response.statusCode()).toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
            return status >= 200 && status < 300;
        } catch (ExecutionException | TimeoutException failure) {
            throw new IOException("Webhook delivery failed", failure);
        } finally {
            // A receiver cannot make us buffer an unlimited response body or retain an idle connection.
            client.close();
        }
    }

    /** The normalized URL; {@link IllegalArgumentException} names the problem without echoing the URL. */
    public static String validate(String url) {
        return target(url).uri().toASCIIString();
    }

    private record Target(URI uri, InetAddress address) {}

    private static Target target(String url) {
        if (url == null || url.length() > MAX_LENGTH) throw new IllegalArgumentException("Webhook URL is missing or too long");
        URI uri;
        try { uri = new URI(new URI(url.trim()).toASCIIString()); } catch (URISyntaxException invalid) { throw new IllegalArgumentException("Webhook URL is not a valid URL"); }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) throw new IllegalArgumentException("Webhook URL must start with https://");
        if (uri.getRawUserInfo() != null) throw new IllegalArgumentException("Webhook URL must not contain credentials");
        if (uri.getRawFragment() != null || uri.getPort() == 0 || uri.getPort() > 65535)
            throw new IllegalArgumentException("Webhook URL contains an invalid port or fragment");
        if (uri.toString().length() > MAX_LENGTH) throw new IllegalArgumentException("Webhook URL is too long");
        InetAddress[] addresses;
        try { addresses = InetAddress.getAllByName(uri.getHost()); }
        catch (UnknownHostException unknown) { throw new IllegalArgumentException("Webhook host could not be resolved"); }
        for (var address : addresses) if (!isPublic(address)) throw new IllegalArgumentException("Webhook host must be a public internet address");
        return new Target(uri, addresses[0]);
    }

    /** Rejects loopback, private, link-local, carrier-grade NAT, unique-local and multicast ranges. */
    static boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] raw = address.getAddress();
        int first = raw[0] & 0xff, second = raw[1] & 0xff;
        if (address instanceof Inet4Address) {
            int third = raw[2] & 0xff;
            return first != 0 && first < 224 && !(first == 100 && (second & 0xc0) == 64)
                    && !(first == 192 && (second == 0 && (third == 0 || third == 2) || second == 88 && third == 99))
                    && !(first == 198 && (second == 18 || second == 19 || second == 51 && third == 100))
                    && !(first == 203 && second == 0 && third == 113);
        }
        // Only global unicast; exclude protocol/transition and documentation ranges as well.
        return (first & 0xe0) == 0x20
                && !(first == 0x20 && second == 1 && ((raw[2] & 0xfe) == 0 || (raw[2] & 0xff) == 0x0d && (raw[3] & 0xff) == 0xb8))
                && !(first == 0x20 && second == 2)
                && !(first == 0x3f && second == 0xff && (raw[2] & 0xf0) == 0);
    }
}
