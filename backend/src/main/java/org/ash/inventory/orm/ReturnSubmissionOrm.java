package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MemberRequest;
import org.ash.inventory.model.ReturnSubmission;
import org.ash.inventory.model.UserAccount;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class ReturnSubmissionOrm extends EntityOrm {


    public void persist(ReturnSubmission value) {
        entityManager.persist(value);
    }


    public boolean assignedToOrder(UUID assetId, UUID orderId) {
        return entityManager.createQuery("select count(a) from OrderLineAssetAssignment a where a.assetInstance.id = :asset and a.orderLine.order.id = :order", Long.class)
                .setParameter("asset", assetId).setParameter("order", orderId).getSingleResult() > 0;
    }



    public ReturnSubmission findLocked(UUID id) {
        return findLockedFresh(ReturnSubmission.class, id);
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
                        + " left join fetch r.expectedReturnLocation location"
                        + " left join fetch r.acknowledgedBy"
                        + " where " + InventoryAccessOrm.visible("r.item.accessPolicy")
                        + " and (location is null or " + InventoryAccessOrm.visible("location.accessPolicy") + ")"
                        + " and (:status is null or r.status = :status)" + ownerFilter
                        + " order by r.createdAt desc", ReturnSubmission.class)
                .setParameter("status", status);
        if (!manager) query.setParameter("actor", actor);
        InventoryAccessOrm.bind(query, actor);
        return query.getResultList();
    }

    /** Damage reports on these items that are still awaiting review or repair, newest first. */
    public List<DamageReport> openDamage(java.util.Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return entityManager.createQuery(
                "select d from DamageReport d join fetch d.reporter left join fetch d.assetInstance left join fetch d.factionOrder"
                        + " where d.item.id in :items and d.status in :open order by d.createdAt desc", DamageReport.class)
                .setParameter("items", itemIds)
                .setParameter("open", List.of(DomainEnums.DamageStatus.reported, DomainEnums.DamageStatus.triaged,
                        DomainEnums.DamageStatus.awaiting_repair, DomainEnums.DamageStatus.in_review,
                        DomainEnums.DamageStatus.in_repair))
                .getResultList();
    }

    /** Contributor damage requests on these items that stand alone, without a linked damage report. */
    public List<MemberRequest> openMemberDamage(java.util.Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return entityManager.createQuery(
                "select r from MemberRequest r join fetch r.requester join fetch r.item where r.item.id in :items"
                        + " and r.kind = 'damage' and r.status <> 'resolved' and r.damageReport is null order by r.createdAt desc", MemberRequest.class)
                .setParameter("items", itemIds)
                .getResultList();
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

}
