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

    public List<Notification> forRecipient(UserAccount recipient, int offset, int limit) {
        return entityManager.createQuery("from Notification n where n.recipient = :recipient order by n.createdAt desc", Notification.class)
                .setParameter("recipient", recipient).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public Notification find(UUID id) { return entityManager.find(Notification.class, id); }
}
