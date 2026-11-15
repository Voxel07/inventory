package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.contract.dto.TaskFilters;

import org.ash.inventory.operations.internal.model.EquipmentCommitment;
import org.ash.inventory.operations.internal.model.InventoryTransfer;
import org.ash.inventory.operations.internal.model.InventoryTransferLine;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.LoanArrangement;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.stream.Stream;

/** Persistence queries for the Loan use cases. Business rules remain in the service. */
@ApplicationScoped
public class LoanOrm extends EntityOrm {
    @jakarta.inject.Inject InventoryAccessOrm access;
    public List<LoanArrangement> arrangements(TaskFilters filters, int offset, int limit) {
        var predicates = new TaskQuery("from LoanArrangement l join fetch l.commitment c join fetch c.item join fetch l.providerLocation where 1=1"
                + InventoryAccessOrm.scope("loan", "l"))
                .search(filters.search, "c.item.name", "c.item.sku", "l.provider", "l.contact")
                .equal("l.providerLocation.id", "locationId", filters.locationId);
        if ("open".equals(filters.status)) predicates.where("c.cancelled = false and l.returned < c.quantity");
        else if ("history".equals(filters.status)) predicates.where("(c.cancelled = true or l.returned = c.quantity)");
        else if ("collect".equals(filters.status)) predicates.where("c.cancelled = false and l.collected < c.quantity");
        else if ("return".equals(filters.status)) predicates.where("c.cancelled = false and l.returned < l.collected");
        else if (filters.status != null && !filters.status.isBlank()) throw org.ash.inventory.platform.api.ApiException.badRequest("Unknown loan task");
        var query = predicates.bind(entityManager.createQuery(predicates.ordered("c.returnDue, l.createdAt desc, l.id desc"), LoanArrangement.class));
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
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
