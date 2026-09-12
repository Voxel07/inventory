package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.UserAccount;

import java.util.List;
import java.util.UUID;

/** Database access for application users. */
@ApplicationScoped
public class UserOrm {
    private final EntityManager entityManager;

    public UserOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public UserAccount findByExternalSubject(String subject) {
        return entityManager.createQuery("from UserAccount user where user.externalSubject = :subject", UserAccount.class)
                .setParameter("subject", subject).getResultStream().findFirst().orElse(null);
    }

    public UserAccount find(UUID id) { return entityManager.find(UserAccount.class, id); }
    public List<UserAccount> users(int offset, int limit) {
        return entityManager.createQuery("from UserAccount user order by user.name, user.email", UserAccount.class)
                .setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public void persist(UserAccount user) { entityManager.persist(user); }
}
