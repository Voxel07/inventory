package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

/** Persistence queries for the Equipment use cases. Business rules remain in the service. */
@ApplicationScoped
public class EquipmentOrm extends EntityOrm {
    public List<Item> activeItems() {
        return entityManager.createQuery("from Item i where i.active = true", Item.class).getResultList();
    }

    public Stream<InventoryPosition> internalPositions(Item item, UUID providerId) {
        return entityManager.createQuery("from InventoryPosition p where p.item = :item and p.location.id <> :providerId", InventoryPosition.class)
                .setParameter("item", item).setParameter("providerId", providerId).getResultStream();
    }

    public Long openMemberDamage(Item item) {
        return entityManager.createQuery("select count(r) from MemberRequest r where r.item = :item and r.kind = 'damage' and r.status <> 'resolved'", Long.class).setParameter("item", item).getSingleResult();
    }

    public List<LoanArrangement> openLoans(Item item) {
        return entityManager.createQuery("from LoanArrangement l where l.commitment.item = :item and l.commitment.cancelled = false and l.returned < l.commitment.quantity", LoanArrangement.class).setParameter("item", item).getResultList();
    }

    public Stream<LoanArrangement> commitmentLoans(EquipmentCommitment commitment) {
        return entityManager.createQuery("from LoanArrangement l where l.commitment = :c", LoanArrangement.class).setParameter("c", commitment).getResultStream();
    }

    public Stream<StockTransaction> consumption(Item item) {
        return entityManager.createQuery("from StockTransaction t where t.item = :item and t.type = :type", StockTransaction.class)
                .setParameter("item", item).setParameter("type", DomainEnums.TransactionType.consumed).getResultStream();
    }

    public Long missingFactionLines(Item item) {
        return entityManager.createQuery("select count(l) from FactionOrderLine l where l.item = :item and l.missingQuantity > 0", Long.class).setParameter("item", item).getSingleResult();
    }

    public Stream<GeneralOrder> generalOrders() {
        return entityManager.createQuery("from GeneralOrder", GeneralOrder.class).getResultStream();
    }

    public Long inTransitPositions(Item item) {
        return entityManager.createQuery("select count(p) from InventoryPosition p where p.item = :item and p.quantityInTransit > 0", Long.class).setParameter("item", item).getSingleResult();
    }

    public List<AssetInstance> activeAssets(Item item) {
        return entityManager.createQuery("from AssetInstance a where a.item = :item and a.active = true", AssetInstance.class).setParameter("item", item).getResultList();
    }

    public List<EquipmentCommitment> commitments(Item item) {
        return entityManager.createQuery("from EquipmentCommitment c where c.item = :item order by c.availableFrom desc, c.createdAt desc", EquipmentCommitment.class).setParameter("item", item).getResultList();
    }
}
