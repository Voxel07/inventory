package org.ash.inventory.notification.internal;

import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * What happened, for push channels the recipient chose (ntfy topic, personal webhook): the same title, details and
 * target the in-app inbox shows for the notice. Mirrors the frontend's notificationTitle/noticeDetails/notificationPath.
 */
record NotificationText(String title, String body, String path) {
    static NotificationText of(String type, Map<String, Object> payload, UUID orderId) {
        String order = text(payload, "orderCode");
        String title = switch (type) {
            case "action_reminder" -> "Reminder: an inventory task is due";
            case "action_digest" -> "Open inventory tasks need attention";
            case "item_request_declined" -> text(payload, "requestName") == null ? "One of your requests was declined"
                    : "Your request \"" + text(payload, "requestName") + "\" was declined";
            case "item_requested" -> {
                String item = Objects.requireNonNullElse(text(payload, "itemName"), "Your item");
                String requester = text(payload, "requesterName");
                yield requester == null ? item + " was requested" : requester + " requested " + item;
            }
            case "order_items_assigned" -> order == null ? "Prepare ordered items" : "Prepare items for order " + order;
            case "order_group_ready" -> order == null ? "Your items are ready for pickup" : "Your items for order " + order + " are ready for pickup";
            case "order_ready" -> order == null ? "Order is ready for pickup" : "Order " + order + " is ready for pickup";
            default -> "Inventory notification";
        };
        String body = switch (type) {
            case "action_reminder" -> "Open the app to see the task you set a reminder for.";
            case "action_digest" -> "Pickups, overdue returns, expiring lots or maintenance are waiting for you.";
            case "item_requested" -> details(payload, "reference");
            case "item_request_declined" -> details(payload, "reason", "reference");
            case "order_items_assigned", "order_group_ready" -> count(payload, "groupCount", "pickup group");
            case "order_ready" -> details(payload, "collectorName", "pickupLocation");
            default -> details(payload, "faction", "groupNames", "pickupLocation");
        };
        return new NotificationText(title, body.isEmpty() ? title : body, path(type, payload, orderId));
    }

    /** The in-app target of the notice; reminders and digests open the task overview. */
    private static String path(String type, Map<String, Object> payload, UUID orderId) {
        String path = text(payload, "path");
        if (type.equals("action_reminder") || type.equals("action_digest")) return "/";
        if (path != null && (path.startsWith("/orders?") || path.startsWith("/items/") || path.startsWith("/orders/"))) return path;
        return orderId == null ? "/" : "/orders/faction/" + orderId;
    }

    private static String details(Map<String, Object> payload, String... keys) {
        return String.join(" · ", Stream.of(keys).map(key -> text(payload, key)).filter(Objects::nonNull).toList());
    }

    private static String count(Map<String, Object> payload, String key, String noun) {
        return payload.get(key) instanceof Number number && number.intValue() > 0
                ? number.intValue() + " " + noun + (number.intValue() == 1 ? "" : "s") : "";
    }

    private static String text(Map<String, Object> payload, String key) {
        return payload.get(key) instanceof String value && !value.isBlank() ? value.trim() : null;
    }
}
