package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.UserAccount;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/** Database access for application users. */
@ApplicationScoped
public class UserOrm {
    private final EntityManager entityManager;
    private final ObjectMapper json;

    public UserOrm(EntityManager entityManager, ObjectMapper json) { this.entityManager = entityManager; this.json = json; }

    /**
     * Returns the account for {@code (issuer, subject)}, creating it on first contact. Parallel first
     * requests of one account all miss the lookup; the losing insert waits for the winner's commit and
     * skips, so every request continues with the single row instead of failing on the identity key.
     */
    public UserAccount provision(String issuer, String subject, String name, String email,
            Set<DomainEnums.UserRole> roles, Collection<String> factions) {
        var assigned = new TreeSet<>(roles);
        try {
            entityManager.createNativeQuery("""
                    insert into app_users (id, created_at, updated_at, issuer, external_subject, name, email, role, roles, factions, access_revision)
                    values (:id, now(), now(), :issuer, :subject, :name, cast(:email as varchar), :role, cast(:roles as jsonb), cast(:factions as jsonb), 0)
                    on conflict (issuer, external_subject) do nothing""")
                    .setParameter("id", UUID.randomUUID()).setParameter("issuer", issuer).setParameter("subject", subject)
                    .setParameter("name", name).setParameter("email", email).setParameter("role", assigned.last().name())
                    .setParameter("roles", json.writeValueAsString(assigned)).setParameter("factions", json.writeValueAsString(factions))
                    .executeUpdate();
        } catch (JsonProcessingException e) { throw new IllegalStateException(e); }
        return findByIdentity(issuer, subject);
    }

    public UserAccount findByIdentity(String issuer, String subject) {
        return entityManager.createQuery("from UserAccount user where user.issuer = :issuer and user.externalSubject = :subject", UserAccount.class)
                .setParameter("issuer", issuer).setParameter("subject", subject).getResultStream().findFirst().orElse(null);
    }

    public UserAccount find(UUID id) { return entityManager.find(UserAccount.class, id); }
    public boolean isManaged(UserAccount user) { return entityManager.contains(user); }
    public List<UserAccount> users(String search, int offset, int limit) {
        boolean searching = search != null && !search.isBlank();
        var query = entityManager.createQuery("from UserAccount user"
                + (searching ? " where lower(user.name) like :search or lower(user.email) like :search" : "")
                + " order by user.name, user.email, user.id", UserAccount.class);
        if (searching) query.setParameter("search", "%" + search.trim().toLowerCase(java.util.Locale.ROOT) + "%");
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public boolean adminExists() {
        return !entityManager.createQuery("select u.id from UserAccount u where u.active = true and u.role = :role", UUID.class)
                .setParameter("role", org.ash.inventory.operations.internal.model.DomainEnums.UserRole.admin).setMaxResults(1).getResultList().isEmpty();
    }

    /** Admin directory filters match independently assigned roles, not only the highest role. */
    public List<UserAccount> directory(String search, DomainEnums.UserRole role, int offset, int limit) {
        boolean searching = search != null && !search.isBlank();
        var query = entityManager.createNativeQuery("select * from app_users where true"
                + (searching ? " and (strpos(lower(name), :search) > 0 or strpos(lower(coalesce(email, '')), :search) > 0)" : "")
                + (role != null ? " and jsonb_exists(roles, :role)" : "")
                + " order by name, email, id", UserAccount.class);
        if (searching) query.setParameter("search", search.trim().toLowerCase(java.util.Locale.ROOT));
        if (role != null) query.setParameter("role", role.name());
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public long admins() {
        return entityManager.createQuery("select count(u) from UserAccount u where u.active = true and u.role = :role", Long.class)
                .setParameter("role", org.ash.inventory.operations.internal.model.DomainEnums.UserRole.admin).getSingleResult();
    }
    public UserAccount findLocked(UUID id) { return entityManager.find(UserAccount.class, id, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE); }
    /** Serializes role changes so the last admin can never be removed concurrently. */
    public void lockAdmins() {
        entityManager.createQuery("from UserAccount u where u.active = true and u.role = :role order by u.id", UserAccount.class)
                .setParameter("role", org.ash.inventory.operations.internal.model.DomainEnums.UserRole.admin)
                .setLockMode(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
    public boolean factionExists(String eventType, String slug) {
        return !entityManager.createQuery("select f.id from Faction f where upper(f.eventType) = :eventType and lower(f.slug) = :slug", UUID.class)
                .setParameter("eventType", eventType).setParameter("slug", slug).setMaxResults(1).getResultList().isEmpty();
    }
}
