package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;
import java.util.stream.Stream;

/** Persistence queries for the Loan use cases. Business rules remain in the service. */
@ApplicationScoped
public class LoanOrm extends EntityOrm {
    public Stream<LoanArrangement> arrangements() {
        return entityManager.createQuery("from LoanArrangement order by createdAt desc", LoanArrangement.class).getResultStream();
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
