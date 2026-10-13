package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.Notification;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.NotificationOrm;

import java.util.Collection;
import java.util.LinkedHashMap;

/**
 * Tells owners (e.g. tenants) when an item they offered for use is requested by someone else. Runs in
 * the requesting command's transaction; each item is announced once per request source.
 */
@ApplicationScoped
public class ItemRequestNotifier {
    public static final String TYPE = "item_requested";

    @Inject NotificationOrm notifications;

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
            notifications.lockRecipient(owner);
            if (notifications.exists(owner, TYPE, key)) continue;
            var n = new Notification();
            n.recipient = owner;
            n.type = TYPE;
            n.dedupeKey = key;
            // The owner's own item only: no order or location ids, so the notice stays readable for
            // tenants, whose responses drop every reference to organization data.
            n.payload.put("itemId", item.id.toString());
            n.payload.put("itemName", item.name);
            n.payload.put("requesterName", requester.name);
            n.payload.put("sourceKind", sourceKind);
            n.payload.put("reference", reference == null ? "" : reference);
            n.payload.put("path", "/items/" + item.id);
            notifications.persist(n);
            count++;
        }
        return count;
    }
}
