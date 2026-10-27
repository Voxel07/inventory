package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.integration.api.IntegrationFeed;
import org.ash.inventory.notification.api.NtfyPublisher;
import org.ash.inventory.operations.internal.model.Assembly;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.runtime.WorkerRoles;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import java.util.*;

/**
 * Posts item and assembly CRUD and user management to fixed admin ntfy topics. A durable integration
 * consumer collects the events of one interval and posts one message per topic and action, so bulk
 * changes produce a summary instead of a message per record. Private (personal) resources are never posted.
 */
@ApplicationScoped
public class NtfyTopicFeed {
    private static final Logger LOG = Logger.getLogger(NtfyTopicFeed.class);
    private static final String CONSUMER = "ntfy-topics";
    private static final Set<String> ACTIONS = Set.of("created", "updated", "deleted");
    private static final Map<String, String> TAGS = Map.of("created", "heavy_plus_sign", "updated", "pencil2", "deleted", "wastebasket");
    private static final int MAX_LINES = 10, MAX_POLLS = 10, MAX_ATTEMPTS = 5;
    @Inject IntegrationFeed feed;
    @Inject NtfyPublisher ntfy;
    @Inject WorkerRoles workers;
    @Inject EntityManager em;
    @ConfigProperty(name = "inventory.notifications.ntfy-topics.items") String itemsTopic;
    @ConfigProperty(name = "inventory.notifications.ntfy-topics.items-actions") String itemActions;
    @ConfigProperty(name = "inventory.notifications.ntfy-topics.assemblies") String assembliesTopic;
    @ConfigProperty(name = "inventory.notifications.ntfy-topics.assemblies-actions") String assemblyActions;
    @ConfigProperty(name = "inventory.notifications.ntfy-topics.users") String usersTopic;
    @ConfigProperty(name = "inventory.public-url", defaultValue = "http://localhost:5173") String publicUrl;
    private final Map<String, Catalog> catalog = new HashMap<>();
    private String users;
    private volatile boolean active;

    /** One admin topic for a catalog resource; {@code actions} limits which changes are posted. */
    private record Catalog(String topic, Set<String> actions, String singular, String plural, String path) {}
    private record Line(IntegrationFeed.Delivery delivery, String text) {}

    void start(@Observes StartupEvent ignored) {
        catalog.clear();
        catalog("items", itemsTopic, itemActions, "Item", "items", "/items");
        catalog("assemblies", assembliesTopic, assemblyActions, "Assembly", "assemblies", "/assemblies");
        users = topic(usersTopic);
        if (!workers.enabled("notifications")) return;
        var prefixes = new ArrayList<String>();
        if (!catalog.isEmpty()) prefixes.add("catalog.changed");
        if (users != null) prefixes.add("user.");
        active = ntfy.enabled() && !prefixes.isEmpty();
        // An abandoned subscription would keep its events from the outbox purge.
        if (active) feed.subscribe(CONSUMER, prefixes); else feed.remove(CONSUMER);
    }

    private void catalog(String resource, String configuredTopic, String configuredActions, String singular, String plural, String path) {
        String topic = topic(configuredTopic);
        var actions = new TreeSet<String>();
        for (var action : configuredActions.split(",")) {
            String value = action.trim().toLowerCase(Locale.ROOT);
            if (value.isEmpty() || value.equals("none")) continue;
            if (!ACTIONS.contains(value)) throw new IllegalArgumentException("Unknown ntfy " + resource + " action: " + value);
            actions.add(value);
        }
        if (topic != null && !actions.isEmpty()) catalog.put(resource, new Catalog(topic, actions, singular, plural, path));
    }

    /** Admin feed topics cannot be chosen as personal topics, so users cannot make the API post into them. */
    public boolean reserved(String topic) {
        return topic != null && java.util.stream.Stream.of(itemsTopic, assembliesTopic, usersTopic)
                .map(String::trim).anyMatch(configured -> configured.equalsIgnoreCase(topic.trim()));
    }

    private static String topic(String configured) {
        String topic = configured.trim();
        if (topic.isEmpty() || topic.equals("none")) return null;
        if (!topic.matches("[A-Za-z0-9_-]{1,64}")) throw new IllegalArgumentException("Invalid ntfy topic: " + topic);
        return topic;
    }

    @Scheduled(every = "${inventory.notifications.ntfy-topics.interval}", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void publish() {
        if (!active) return;
        var deliveries = new ArrayList<IntegrationFeed.Delivery>();
        for (int poll = 0; poll < MAX_POLLS; poll++) {
            var batch = feed.poll(CONSUMER, 100).deliveries();
            deliveries.addAll(batch);
            if (batch.size() < 100) break;
        }
        if (deliveries.isEmpty()) return;
        var messages = new LinkedHashMap<List<String>, List<Line>>();
        var ignored = new ArrayList<IntegrationFeed.Delivery>();
        QuarkusTransaction.requiringNew().run(() -> {
            for (var delivery : deliveries) {
                var event = delivery.event();
                List<String> key = null; String text = null;
                if (event.type().equals("catalog.changed") && catalog.containsKey(event.aggregateType())) {
                    var target = catalog.get(event.aggregateType());
                    String action = String.valueOf(event.payload().get("action"));
                    text = target.actions().contains(action) ? catalogLine(event) : null;
                    key = List.of(event.aggregateType(), action);
                } else if (users != null && event.type().startsWith("user.")) {
                    text = userLine(event);
                    key = List.of("users");
                }
                if (text == null) ignored.add(delivery);
                else messages.computeIfAbsent(key, ignoredKey -> new ArrayList<>()).add(new Line(delivery, text));
            }
        });
        ignored.forEach(this::acknowledge);
        for (var entry : messages.entrySet()) {
            var lines = entry.getValue();
            boolean sent = false;
            try { sent = ntfy.publish(message(entry.getKey(), lines)); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); return; }
            catch (Exception failure) { /* Never log credentials or server responses; the lease expires and the events return. */ }
            if (!sent) {
                // A long ntfy outage drops admin feed messages rather than retaining their events indefinitely.
                if (lines.stream().anyMatch(line -> line.delivery().attempt() < MAX_ATTEMPTS)) continue;
                LOG.warnf("Dropping %d ntfy admin feed event(s) after %d attempts", lines.size(), MAX_ATTEMPTS);
            }
            lines.forEach(line -> acknowledge(line.delivery()));
        }
    }

    private NtfyPublisher.Message message(List<String> key, List<Line> lines) {
        String base = publicUrl.replaceAll("/+$", "");
        var body = new StringBuilder();
        lines.stream().limit(MAX_LINES).forEach(line -> body.append(body.isEmpty() ? "" : "\n").append(lines.size() > 1 ? "• " : "").append(line.text()));
        if (lines.size() > MAX_LINES) body.append("\n… and ").append(lines.size() - MAX_LINES).append(" more");
        if (key.getFirst().equals("users")) {
            String title = lines.size() == 1 ? "User management" : lines.size() + " user management changes";
            return new NtfyPublisher.Message(users, title, body.toString(), base + "/users", List.of("busts_in_silhouette"));
        }
        var target = catalog.get(key.getFirst());
        String action = key.get(1);
        boolean single = lines.size() == 1;
        String title = single ? target.singular() + " " + action : lines.size() + " " + target.plural() + " " + action;
        String click = base + target.path() + (single && !action.equals("deleted") ? "/" + lines.getFirst().delivery().event().aggregateId() : "");
        return new NtfyPublisher.Message(target.topic(), title, body.toString(), click, List.of(TAGS.get(action)));
    }

    /** Null for private resources: personal inventory stays out of the admin feed. */
    private String catalogLine(DomainEventService.Envelope event) {
        if (event.aggregateType().equals("items")) {
            var item = em.find(Item.class, event.aggregateId());
            if (item == null || item.accessPolicy != null) return null;
            return clip(item.name) + (item.sku == null ? "" : " (" + item.sku + ")") + by(event.actorId());
        }
        var assembly = em.find(Assembly.class, event.aggregateId());
        if (assembly == null || assembly.accessPolicy != null) return null;
        return clip(assembly.name) + by(event.actorId());
    }

    private String userLine(DomainEventService.Envelope event) {
        var payload = event.payload();
        String user = name(event.aggregateId());
        String reason = payload.get("reason") == null ? "" : " — " + clip(payload.get("reason").toString());
        return switch (event.type()) {
            case "user.created" -> "New account: " + user + " (" + join(payload.get("roles")) + ")";
            case "user.pseudonymized" -> "Account pseudonymized: " + user + by(event.actorId()) + reason;
            case "user.changed" -> payload.containsKey("active")
                    ? (Boolean.TRUE.equals(payload.get("active")) ? "Account reactivated: " : "Account deactivated: ") + user + by(event.actorId()) + reason
                    : payload.get("after") instanceof Map<?, ?> after
                        ? "Access changed: " + user + " → roles " + join(after.get("roles")) + ", factions " + join(after.get("factions")) + by(event.actorId()) + reason
                        : null;
            default -> null;
        };
    }

    private String by(UUID actor) { return actor == null ? "" : " · by " + name(actor); }
    private String name(UUID id) {
        var user = id == null ? null : em.find(UserAccount.class, id);
        return user == null ? "unknown user" : clip(user.name);
    }
    private static String join(Object values) {
        return values instanceof Collection<?> list && !list.isEmpty() ? String.join(", ", list.stream().map(String::valueOf).toList()) : "none";
    }
    private static String clip(String value) { return value.length() <= 80 ? value : value.substring(0, 79) + "…"; }

    private void acknowledge(IntegrationFeed.Delivery delivery) {
        try { feed.acknowledge(CONSUMER, new IntegrationFeed.Receipt(delivery.event().eventId(), delivery.lease())); }
        catch (ApiException leaseChanged) { /* Another poll owns the event now and will post it. */ }
    }
}
