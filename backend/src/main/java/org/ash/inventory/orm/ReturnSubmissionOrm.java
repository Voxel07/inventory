package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.ReturnSubmission;
import org.ash.inventory.model.UserAccount;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class ReturnSubmissionOrm {
    private final EntityManager entityManager;

    public ReturnSubmissionOrm(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public void persist(ReturnSubmission value) {
        entityManager.persist(value);
    }

    public <T> T find(Class<T> type, UUID id) {
        return entityManager.find(type, id);
    }

    public <T> T findLocked(Class<T> type, UUID id) {
        return entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE);
    }

    public ReturnSubmission findLocked(UUID id) {
        return entityManager.find(ReturnSubmission.class, id, LockModeType.PESSIMISTIC_WRITE);
    }

    public List<ReturnSubmission> list(DomainEnums.ReturnSubmissionStatus status, UserAccount actor, boolean manager) {
        String ownerFilter = manager ? "" : " and (r.submittedBy = :actor or r.returnedFor = :actor)";
        var query = entityManager.createQuery(
                "from ReturnSubmission r"
                        + " join fetch r.item"
                        + " left join fetch r.assetInstance"
                        + " left join fetch r.factionOrder"
                        + " join fetch r.returnedFor"
                        + " join fetch r.submittedBy"
                        + " left join fetch r.expectedReturnLocation"
                        + " left join fetch r.acknowledgedBy"
                        + " where (:status is null or r.status = :status)" + ownerFilter
                        + " order by r.createdAt desc", ReturnSubmission.class)
                .setParameter("status", status);
        if (!manager) query.setParameter("actor", actor);
        return query.getResultList();
    }

    public long pendingQuantity(Item item, UserAccount user) {
        return entityManager.createQuery(
                "select coalesce(sum(r.quantity), 0) from ReturnSubmission r"
                        + " where r.item = :item and r.returnedFor = :user and r.status = :status", Long.class)
                .setParameter("item", item)
                .setParameter("user", user)
                .setParameter("status", DomainEnums.ReturnSubmissionStatus.pending)
                .getSingleResult();
    }

    public long checkedOutQuantity(Item item, UserAccount user) {
        return entityManager.createQuery(
                "select coalesce(sum(case when tx.type = :checkout then tx.quantity"
                        + " when tx.type = :checkin then -tx.quantity else 0 end), 0)"
                        + " from StockTransaction tx where tx.item = :item and tx.user = :user", Long.class)
                .setParameter("item", item)
                .setParameter("user", user)
                .setParameter("checkout", DomainEnums.TransactionType.checkout)
                .setParameter("checkin", DomainEnums.TransactionType.checkin)
                .getSingleResult();
    }
}
