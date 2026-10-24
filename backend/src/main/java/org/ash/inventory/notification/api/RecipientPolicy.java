package org.ash.inventory.notification.api;

import java.util.UUID;
/** Resolves current account/contact and resource authorization, never cached permissions. */
public interface RecipientPolicy {
    /** Contact fields are null when the recipient is not allowed or has not provided them. */
    record Decision(boolean allowed, String email, String ntfyTopic, String webhookUrl) {}
    Decision resolve(UUID recipientId, UUID orderId, UUID itemId);
}
