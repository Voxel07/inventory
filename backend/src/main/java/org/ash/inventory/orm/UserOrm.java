package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.UserAccount;

import java.util.List;
import java.util.UUID;

/** Database access for application users. */
@ApplicationScoped
public class UserOrm {
    @Inject EntityManager entityManager;

    public UserAccount findByExternalSubject(String subject) {
        return entityManager.createQuery("from UserAccount user where user.externalSubject = :subject", UserAccount.class)
                .setParameter("subject", subject).getResultStream().findFirst().orElse(null);
    }

    public UserAccount find(UUID id) { return entityManager.find(UserAccount.class, id); }
    public List<UserAccount> users() { return entityManager.createQuery("from UserAccount user order by user.name, user.email", UserAccount.class).getResultList(); }
    public void persist(UserAccount user) { entityManager.persist(user); }
}
