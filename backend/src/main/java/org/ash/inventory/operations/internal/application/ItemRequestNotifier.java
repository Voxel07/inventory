package org.ash.inventory.operations.internal.application;

import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.UserAccount;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.Collection;
import java.util.LinkedHashMap;

/**
 * Tells owners (e.g. tenants) when an item they offered for use is requested by someone else. Runs in
 * the requesting command's transaction; each item is announced once per request source.
 */
@ApplicationScoped
public class ItemRequestNotifier {
    public static final String TYPE = "item_requested";

    @Inject NotificationService notifications;

    /**
     * @param sourceKind {@code faction_order}, {@code general_order}, {@code pickup_request} or {@code damage_request}
     * @param reference  display reference (order code or name); may be empty
     * @param scope      identifies the request source for deduplication (e.g. the order id)
     */
    public int notifyOwners(Collection<Item> items, UserAccount requester, String sourceKind, String reference, String scope) {
        var unique = new LinkedHashMap<java.util.UUID, Item>();
        for (var item : items) if (item != null) unique.putIfAbsent(item.id, item);
        int count = 0;
        for (var item : unique.values()) {
            var policy = item.accessPolicy;
            if (policy == null || !policy.publicUse || policy.owner.id.equals(requester.id)) continue;
            var owner = policy.owner;
            String key = sourceKind + ":" + scope + ":" + item.id;
            if (notifications.exists(owner.id, TYPE, key)) continue;
            var payload = new java.util.LinkedHashMap<String,Object>();
            // The owner's own item only: no order or location ids, so the notice stays readable for
            // tenants, whose responses drop every reference to organization data.
            payload.put("itemId", item.id.toString());
            payload.put("itemName", item.name);
            payload.put("requesterName", requester.name);
            payload.put("sourceKind", sourceKind);
            payload.put("reference", reference == null ? "" : reference);
            payload.put("path", "/items/" + item.id);
            notifications.enqueue(owner.id, null, TYPE, key, payload);
            count++;
        }
        return count;
    }
}
