package org.ash.inventory.notification.internal;

import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.notification.api.NtfyPublisher;
import org.ash.inventory.notification.api.PersonalWebhookPublisher;
import org.ash.inventory.notification.api.RecipientPolicy;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import io.quarkus.scheduler.Scheduled;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.Callable;

/**
 * Durable, at-least-once delivery to the webhook gateway (by email), the recipient's own webhook and ntfy
 * (by the recipient's own topic). Each channel's acknowledgement is stored, so a retry only posts to channels
 * that failed; a lost acknowledgement can still repeat a message. The gateway must deduplicate the notification
 * UUID; personal webhooks receive it as {@code Idempotency-Key} too. Channels the recipient set up themselves
 * (ntfy topic, personal webhook) say what happened and link to it, like the in-app inbox; the shared gateway
 * keeps the generic sign-in text.
 */
@ApplicationScoped
public class NotificationDeliveryService {
    private static final String SUBJECT = "Inventory notification";
    private static final String TEXT = "You have an inventory notification. Sign in to review your current tasks.";
    @Inject NotificationService notifications;
    @Inject RecipientPolicy audience;
    @Inject NtfyPublisher ntfy;
    @Inject PersonalWebhookPublisher webhooks;
    @Inject org.ash.inventory.platform.runtime.WorkerRoles workers;
    @Inject ObjectMapper json;
    @ConfigProperty(name="inventory.notifications.webhook-url") Optional<String> endpoint;
    @ConfigProperty(name="inventory.notifications.webhook-token") Optional<String> token;
    @ConfigProperty(name="inventory.public-url", defaultValue="http://localhost:5173") String publicUrl;
    @ConfigProperty(name="inventory.notifications.ntfy-public-url") Optional<String> ntfyPublicUrl;
    private static final org.jboss.logging.Logger LOG = org.jboss.logging.Logger.getLogger(NotificationDeliveryService.class);

    /** Links in pushes and mails point at {@code inventory.public-url}; a production localhost value is a misconfiguration. */
    void checkPublicUrls(@jakarta.enterprise.event.Observes io.quarkus.runtime.StartupEvent ignored) {
        if (io.quarkus.runtime.LaunchMode.current() != io.quarkus.runtime.LaunchMode.NORMAL) return;
        if (local(publicUrl)) LOG.warnf("inventory.public-url (INVENTORY_PUBLIC_URL) is %s: notification links will not open for users. Set it to the app's public address.", publicUrl);
        if (ntfy.enabled() && ntfyPublicUrl.filter(NotificationDeliveryService::local).isPresent())
            LOG.warnf("inventory.notifications.ntfy-public-url (INVENTORY_NOTIFICATION_NTFY_PUBLIC_URL) is %s: users cannot subscribe from their phones. Set it to the public ntfy address.", ntfyPublicUrl.get());
    }

    private static boolean local(String url) {
        String host = java.net.URI.create(url.trim()).getHost();
        return host == null || host.equals("localhost") || host.equals("127.0.0.1") || host.equals("[::1]") || host.endsWith(".localhost");
    }
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    @Scheduled(every="30s", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    public void deliver() {
        // Personal webhooks need no deployment configuration, so delivery always runs on notification workers.
        if (!workers.enabled("notifications")) return;
        for (int count=0; count<20; count++) {
            var delivery = notifications.claim(); if (delivery == null) return;
            RecipientPolicy.Decision recipient;
            try { recipient=audience.resolve(delivery.recipientId(),delivery.orderId(),delivery.itemId()); }
            catch(RuntimeException unavailable) { notifications.finish(delivery, NotificationService.Outcome.RETRY, delivery.delivered()); continue; }
            // The shared gateway gets generic text only; the recipient's own topic and webhook get what happened.
            var notice = NotificationText.of(delivery.type(), delivery.payload(), delivery.orderId());
            String link = publicUrl.replaceAll("/+$", "") + notice.path();
            var channels = new LinkedHashMap<String, Callable<Boolean>>();
            if (endpoint.isPresent() && recipient.email() != null) channels.put("gateway", () -> sendGateway(delivery, recipient.email()));
            if (recipient.webhookUrl() != null) channels.put("webhook", () -> webhooks.publish(recipient.webhookUrl(), delivery.id(), notice.title(), notice.body(), link));
            if (ntfy.enabled() && recipient.ntfyTopic() != null)
                channels.put("ntfy", () -> ntfy.publish(new NtfyPublisher.Message(recipient.ntfyTopic(), notice.title(), notice.body(), link, List.of("package"))));
            if(!recipient.allowed() || channels.isEmpty()) { notifications.finish(delivery,NotificationService.Outcome.SKIPPED,delivery.delivered()); continue; }
            var delivered = new TreeSet<>(delivery.delivered());
            for (var channel : channels.entrySet()) {
                if (delivered.contains(channel.getKey())) continue;
                try { if (channel.getValue().call()) delivered.add(channel.getKey()); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); break; }
                catch (Exception exception) { /* Persist only a safe error; never credentials, URLs or gateway responses. */ }
            }
            boolean sent = delivered.containsAll(channels.keySet());
            notifications.finish(delivery, sent ? NotificationService.Outcome.SENT : NotificationService.Outcome.RETRY, delivered);
            if (Thread.currentThread().isInterrupted()) return;
        }
    }

    private boolean sendGateway(NotificationService.Delivery delivery, String email) throws Exception {
        var request = HttpRequest.newBuilder(NtfyPublisher.secure(endpoint.get())).timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                .header("Idempotency-Key", delivery.id().toString());
        token.ifPresent(value -> request.header("Authorization", "Bearer " + value));
        String body = json.writeValueAsString(Map.of("id", delivery.id(), "recipient", email, "subject", SUBJECT, "text", TEXT, "url", publicUrl));
        int status = client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.discarding()).statusCode();
        return status >= 200 && status < 300;
    }
}
