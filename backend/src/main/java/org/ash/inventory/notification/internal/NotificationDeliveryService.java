package org.ash.inventory.notification.internal;

import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.notification.api.NtfyPublisher;
import org.ash.inventory.notification.api.RecipientPolicy;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import io.quarkus.scheduler.Scheduled;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.*;
import java.time.*;
import java.util.*;

/**
 * Durable, at-least-once delivery to the webhook gateway (by email) and ntfy (by the recipient's own topic).
 * The webhook gateway must deduplicate the notification UUID. ntfy is posted last, so a webhook retry never
 * repeats an acknowledged ntfy message; a lost ntfy acknowledgement can still repeat one.
 */
@ApplicationScoped
public class NotificationDeliveryService {
    private static final String SUBJECT = "Inventory notification";
    private static final String TEXT = "You have an inventory notification. Sign in to review your current tasks.";
    @Inject NotificationService notifications;
    @Inject RecipientPolicy audience;
    @Inject NtfyPublisher ntfy;
    @Inject org.ash.inventory.platform.runtime.WorkerRoles workers;
    @Inject ObjectMapper json;
    @ConfigProperty(name="inventory.notifications.webhook-url") Optional<String> endpoint;
    @ConfigProperty(name="inventory.notifications.webhook-token") Optional<String> token;
    @ConfigProperty(name="inventory.public-url", defaultValue="http://localhost:5173") String publicUrl;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    @Scheduled(every="30s", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    public void deliver() {
        if (!workers.enabled("notifications") || (endpoint.isEmpty() && ntfy.server().isEmpty())) return;
        for (int count=0; count<20; count++) {
            var delivery = notifications.claim(); if (delivery == null) return;
            RecipientPolicy.Decision recipient;
            try { recipient=audience.resolve(delivery.recipientId(),delivery.orderId(),delivery.itemId()); }
            catch(RuntimeException unavailable) { notifications.finish(delivery, NotificationService.Outcome.RETRY); continue; }
            boolean webhook = endpoint.isPresent() && recipient.email() != null, push = ntfy.server().isPresent() && recipient.ntfyTopic() != null;
            if(!recipient.allowed() || (!webhook && !push)) { notifications.finish(delivery,NotificationService.Outcome.SKIPPED); continue; }
            boolean sent = false;
            try {
                // No task text, inventory identifiers, names or evidence leave the application.
                sent = (!webhook || sendWebhook(delivery, recipient.email()))
                        && (!push || ntfy.publish(new NtfyPublisher.Message(recipient.ntfyTopic(), SUBJECT, TEXT, publicUrl, List.of("package"))));
            } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
              catch (Exception exception) { /* Persist only a safe error; never credentials or gateway responses. */ }
            notifications.finish(delivery, sent ? NotificationService.Outcome.SENT : NotificationService.Outcome.RETRY);
            if (Thread.currentThread().isInterrupted()) return;
        }
    }

    private boolean sendWebhook(NotificationService.Delivery delivery, String email) throws Exception {
        var request = HttpRequest.newBuilder(NtfyPublisher.secure(endpoint.get())).timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                .header("Idempotency-Key", delivery.id().toString());
        token.ifPresent(value -> request.header("Authorization", "Bearer " + value));
        String body = json.writeValueAsString(Map.of("id", delivery.id(), "recipient", email, "subject", SUBJECT, "text", TEXT, "url", publicUrl));
        int status = client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.discarding()).statusCode();
        return status >= 200 && status < 300;
    }
}
