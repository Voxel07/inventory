package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.Notification;
import org.ash.inventory.model.UserAccount;

import java.util.List;
import java.util.UUID;

/** Database access for user notifications. */
@ApplicationScoped
public class NotificationOrm {
    private final EntityManager entityManager;

    public NotificationOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public List<Notification> forRecipient(UserAccount recipient, boolean unreadOnly, int offset, int limit) {
        return entityManager.createQuery("from Notification n where n.recipient = :recipient"
                        + (unreadOnly ? " and n.readAt is null" : "") + " order by n.createdAt desc, n.id desc", Notification.class)
                .setParameter("recipient", recipient).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    /** Marks every unread notice created up to {@code before}; later arrivals stay unread. */
    public int markAllRead(UserAccount recipient, java.time.Instant before, java.time.Instant now) {
        return entityManager.createQuery("update Notification n set n.readAt = :now where n.recipient = :recipient and n.readAt is null and n.createdAt <= :before")
                .setParameter("now", now).setParameter("recipient", recipient).setParameter("before", before).executeUpdate();
    }

    public long unreadCount(UserAccount recipient) {
        return entityManager.createQuery("select count(n) from Notification n where n.recipient = :recipient and n.readAt is null", Long.class)
                .setParameter("recipient", recipient).getSingleResult();
    }

    public Notification find(UUID id) { return entityManager.find(Notification.class, id); }

    /** Serializes deduplicated notices per recipient. */
    public void lockRecipient(UserAccount recipient) {
        entityManager.lock(recipient, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
    }

    public boolean exists(UserAccount recipient, String type, String dedupeKey) {
        return !entityManager.createQuery("select n.id from Notification n where n.recipient = :recipient and n.type = :type and n.dedupeKey = :key", UUID.class)
                .setParameter("recipient", recipient).setParameter("type", type).setParameter("key", dedupeKey)
                .setMaxResults(1).getResultList().isEmpty();
    }

    public void persist(Notification notification) { entityManager.persist(notification); }
}
