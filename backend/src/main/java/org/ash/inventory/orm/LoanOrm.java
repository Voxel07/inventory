package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;
import java.util.stream.Stream;

/** Persistence queries for the Loan use cases. Business rules remain in the service. */
@ApplicationScoped
public class LoanOrm extends EntityOrm {
    @jakarta.inject.Inject InventoryAccessOrm access;
    public List<LoanArrangement> arrangements(int offset, int limit) {
        var denied = access.deniedReferences(accessActor.current());
        var query = entityManager.createQuery("from LoanArrangement l join fetch l.commitment c join fetch c.item join fetch l.providerLocation where 1 = 1"
                + InventoryAccessOrm.excluding("l", denied) + " order by l.createdAt desc, l.id desc", LoanArrangement.class);
        return InventoryAccessOrm.bindDenied(query, denied).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public java.util.Map<String, String> assetCodes(java.util.Collection<String> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        var result = new java.util.HashMap<String, String>();
        for (var row : entityManager.createQuery("select a.id, a.assetCode from AssetInstance a where a.id in :ids", Object[].class)
                .setParameter("ids", ids.stream().map(java.util.UUID::fromString).toList()).getResultList()) result.put(row[0].toString(), (String) row[1]);
        return result;
    }
    public Long commitmentCount(EquipmentCommitment commitment) {
        return entityManager.createQuery("select count(l) from LoanArrangement l where l.commitment = :c", Long.class).setParameter("c", commitment).getSingleResult();
    }

    public List<LoanArrangement> allArrangements() {
        return entityManager.createQuery("from LoanArrangement", LoanArrangement.class).getResultList();
    }

    public List<InventoryTransferLine> transferLines(InventoryTransfer transfer) {
        return entityManager.createQuery("from InventoryTransferLine where transfer = :t", InventoryTransferLine.class).setParameter("t", transfer).getResultList();
    }

    public Stream<EquipmentCommitment> commitments(Item item) {
        return entityManager.createQuery("from EquipmentCommitment where item = :item", EquipmentCommitment.class).setParameter("item", item).getResultStream();
    }
}
