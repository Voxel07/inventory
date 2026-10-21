package org.ash.inventory.notification.internal;

import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.notification.api.RecipientPolicy;
import org.ash.inventory.platform.runtime.WorkerRoles;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import io.quarkus.scheduler.Scheduled;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;

/** Durable, at-least-once delivery. The gateway must deduplicate the notification UUID. */
@ApplicationScoped
public class NotificationDeliveryService {
    @Inject NotificationService notifications;
    @Inject RecipientPolicy audience;
    @Inject org.ash.inventory.platform.runtime.WorkerRoles workers;
    @Inject ObjectMapper json;
    @ConfigProperty(name="inventory.notifications.webhook-url") Optional<String> endpoint;
    @ConfigProperty(name="inventory.notifications.webhook-token") Optional<String> token;
    @ConfigProperty(name="inventory.public-url", defaultValue="http://localhost:5173") String publicUrl;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    @Scheduled(every="30s", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    public void deliver() {
        if (!workers.enabled("notifications") || endpoint.isEmpty()) return;
        for (int count=0; count<20; count++) {
            var delivery = notifications.claim(); if (delivery == null) return;
            RecipientPolicy.Decision recipient;
            try { recipient=audience.resolve(delivery.recipientId(),delivery.orderId(),delivery.itemId()); }
            catch(RuntimeException unavailable) { notifications.finish(delivery, NotificationService.Outcome.RETRY); continue; }
            if(!recipient.allowed()) { notifications.finish(delivery,NotificationService.Outcome.SKIPPED); continue; }
            boolean sent = false;
            try {
                var uri = URI.create(endpoint.get());
                if (!"https".equals(uri.getScheme()) && !("http".equals(uri.getScheme()) && Set.of("localhost", "127.0.0.1", "::1").contains(uri.getHost())))
                    throw new IllegalArgumentException("Notification endpoint requires HTTPS");
                var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                        .header("Idempotency-Key", delivery.id().toString());
                token.ifPresent(value -> request.header("Authorization", "Bearer " + value));
                // No task text, inventory identifiers, names or evidence leave the application.
                String body = json.writeValueAsString(Map.of("id", delivery.id(), "recipient", recipient.email(), "subject", "Inventory notification",
                        "text", "You have an inventory notification. Sign in to review your current tasks.", "url", publicUrl));
                var response = client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.discarding());
                sent = response.statusCode() >= 200 && response.statusCode() < 300;
            } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
              catch (Exception exception) { /* Persist only a safe error; never credentials or gateway responses. */ }
            notifications.finish(delivery, sent ? NotificationService.Outcome.SENT : NotificationService.Outcome.RETRY);
            if (Thread.currentThread().isInterrupted()) return;
        }
    }

}
