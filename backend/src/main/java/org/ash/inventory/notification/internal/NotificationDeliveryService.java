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
 * UUID; personal webhooks receive it as {@code Idempotency-Key} too.
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
            // No task text, inventory identifiers, names or evidence leave the application.
            var channels = new LinkedHashMap<String, Callable<Boolean>>();
            if (endpoint.isPresent() && recipient.email() != null) channels.put("gateway", () -> sendGateway(delivery, recipient.email()));
            if (recipient.webhookUrl() != null) channels.put("webhook", () -> webhooks.publish(recipient.webhookUrl(), delivery.id(), SUBJECT, TEXT, publicUrl));
            if (ntfy.server().isPresent() && recipient.ntfyTopic() != null)
                channels.put("ntfy", () -> ntfy.publish(new NtfyPublisher.Message(recipient.ntfyTopic(), SUBJECT, TEXT, publicUrl, List.of("package"))));
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
