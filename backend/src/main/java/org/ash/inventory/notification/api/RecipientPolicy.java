package org.ash.inventory.notification.api;

import java.util.UUID;
/** Resolves current account/contact and resource authorization, never cached permissions. */
public interface RecipientPolicy {
    record Decision(boolean allowed, String email) {}
    Decision resolve(UUID recipientId, UUID orderId, UUID itemId);
}
