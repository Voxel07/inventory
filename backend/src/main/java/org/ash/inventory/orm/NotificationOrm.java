package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.Notification;
import org.ash.inventory.model.UserAccount;

import java.util.List;
import java.util.UUID;

/** Database access for user notifications. */
@ApplicationScoped
public class NotificationOrm {
    @Inject EntityManager entityManager;

    public List<Notification> forRecipient(UserAccount recipient) {
        return entityManager.createQuery("from Notification n where n.recipient = :recipient order by n.createdAt desc", Notification.class)
                .setParameter("recipient", recipient).getResultList();
    }

    public Notification find(UUID id) { return entityManager.find(Notification.class, id); }
}
