package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

/** Persistence queries for the Member use cases. Business rules remain in the service. */
@ApplicationScoped
public class MemberOrm extends EntityOrm {
    public List<AssetInstance> checkoutAssets(UUID orderId, UUID itemId) {
        return entityManager.createQuery("select distinct l.assetInstance from CustodyHandoverLine l where l.handover.order.id = :order and l.item.id = :item and l.handover.type = :type and l.assetInstance is not null", AssetInstance.class)
                .setParameter("order", orderId).setParameter("item", itemId).setParameter("type", DomainEnums.HandoverType.checkout).getResultList();
    }

    public Long reconciledAssets(UUID orderId, AssetInstance asset) {
        return entityManager.createQuery("select count(r) from ReturnReconciliation r where r.order.id = :order and r.assetInstance = :asset and r.outcome <> :missing", Long.class)
                .setParameter("order", orderId).setParameter("asset", asset).setParameter("missing", DomainEnums.ReconciliationOutcome.missing).getSingleResult();
    }

    public Long pendingAssets(UUID orderId, AssetInstance asset) {
        return entityManager.createQuery("select count(r) from ReturnSubmission r where r.factionOrder.id = :order and r.assetInstance = :asset and r.status = :status", Long.class)
                .setParameter("order", orderId).setParameter("asset", asset).setParameter("status", DomainEnums.ReturnSubmissionStatus.pending).getSingleResult();
    }

    public List<InventoryPosition> storedPositions(UserAccount actor) {
        return entityManager.createQuery("from InventoryPosition p where p.location.keeperUser = :actor and p.location.active = true and p.quantityOnHand > 0", InventoryPosition.class).setParameter("actor", actor).getResultList();
    }

    public List<AssetInstance> storedAssets(UserAccount actor) {
        return entityManager.createQuery("from AssetInstance a where a.currentLocation.keeperUser = :actor and a.currentLocation.active = true and a.active = true", AssetInstance.class).setParameter("actor", actor).getResultList();
    }

    public Stream<StorageLocation> locations() {
        return entityManager.createQuery("from StorageLocation order by name", StorageLocation.class).getResultStream();
    }

    public Stream<MemberRequest> requestCommands(UUID commandId) {
        return entityManager.createQuery("from MemberRequest where commandId = :id", MemberRequest.class).setParameter("id", commandId).getResultStream();
    }

    public Stream<ReturnSubmission> returnCommands(UUID commandId) {
        return entityManager.createQuery("from ReturnSubmission where memberCommandId = :id", ReturnSubmission.class).setParameter("id", commandId).getResultStream();
    }

    public List<MemberRequest> requests(UserAccount actor, boolean staff) {
        var query = entityManager.createQuery(staff ? "from MemberRequest order by createdAt desc" : "from MemberRequest where requester = :actor order by createdAt desc", MemberRequest.class);
        if (!staff) query.setParameter("actor", actor);
        return query.getResultList();
    }
}
