package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.SyncCommandAudit;
import org.ash.inventory.model.UserAccount;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class SyncAuditOrm {
    private final EntityManager entityManager;

    public SyncAuditOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public SyncCommandAudit find(UUID commandId) {
        return entityManager.createQuery("from SyncCommandAudit audit where audit.commandId = :commandId", SyncCommandAudit.class)
                .setParameter("commandId", commandId).getResultStream().findFirst().orElse(null);
    }

    public SyncCommandAudit findLocked(UUID commandId) {
        var value = find(commandId);
        if (value != null) entityManager.lock(value, LockModeType.PESSIMISTIC_WRITE);
        return value;
    }

    public UserAccount user(UUID id) { return entityManager.find(UserAccount.class, id); }
    public void persist(SyncCommandAudit value) { entityManager.persist(value); }

    public List<SyncCommandAudit> list(String status, int offset, int limit) {
        var jpql = status == null || status.isBlank()
                ? "from SyncCommandAudit audit join fetch audit.user order by audit.createdAt desc"
                : "from SyncCommandAudit audit join fetch audit.user where audit.syncStatus = :status order by audit.createdAt desc";
        var query = entityManager.createQuery(jpql, SyncCommandAudit.class);
        if (status != null && !status.isBlank()) query.setParameter("status", status);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }
}
