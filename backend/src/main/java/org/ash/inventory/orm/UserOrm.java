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

    public UserAccount findByIdentity(String issuer, String subject) {
        return entityManager.createQuery("from UserAccount user where user.issuer = :issuer and user.externalSubject = :subject", UserAccount.class)
                .setParameter("issuer", issuer).setParameter("subject", subject).getResultStream().findFirst().orElse(null);
    }

    public UserAccount find(UUID id) { return entityManager.find(UserAccount.class, id); }
    public boolean isManaged(UserAccount user) { return entityManager.contains(user); }
    public List<UserAccount> users(int offset, int limit) {
        return entityManager.createQuery("from UserAccount user order by user.name, user.email", UserAccount.class)
                .setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public void persist(UserAccount user) { entityManager.persist(user); }
    public boolean adminExists() {
        return !entityManager.createQuery("select u.id from UserAccount u where u.role = :role", UUID.class)
                .setParameter("role", org.ash.inventory.model.DomainEnums.UserRole.admin).setMaxResults(1).getResultList().isEmpty();
    }
    public long admins() {
        return entityManager.createQuery("select count(u) from UserAccount u where u.role = :role", Long.class)
                .setParameter("role", org.ash.inventory.model.DomainEnums.UserRole.admin).getSingleResult();
    }
    public UserAccount findLocked(UUID id) { return entityManager.find(UserAccount.class, id, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE); }
    /** Serializes role changes so the last admin can never be removed concurrently. */
    public void lockAdmins() {
        entityManager.createQuery("from UserAccount u where u.role = :role order by u.id", UserAccount.class)
                .setParameter("role", org.ash.inventory.model.DomainEnums.UserRole.admin)
                .setLockMode(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
    public boolean factionExists(String eventType, String slug) {
        return !entityManager.createQuery("select f.id from Faction f where upper(f.eventType) = :eventType and lower(f.slug) = :slug", UUID.class)
                .setParameter("eventType", eventType).setParameter("slug", slug).setMaxResults(1).getResultList().isEmpty();
    }
}
