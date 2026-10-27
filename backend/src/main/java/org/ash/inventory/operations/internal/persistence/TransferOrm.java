package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.InventoryTransfer;
import org.ash.inventory.operations.internal.model.InventoryTransferLine;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@ApplicationScoped
public class TransferOrm extends EntityOrm {
    @jakarta.inject.Inject InventoryAccessOrm privacyScopes;

    public List<InventoryTransfer> transfers(String status, int offset, int limit) {

        var jpql = status == null || status.isBlank()
                ? "select transfer from InventoryTransfer transfer join fetch transfer.sourceLocation join fetch transfer.destinationLocation join fetch transfer.requestedBy left join fetch transfer.receivedBy where 1=1" + InventoryAccessOrm.scope("transfer", "transfer") + " order by transfer.createdAt desc"
                : "select transfer from InventoryTransfer transfer join fetch transfer.sourceLocation join fetch transfer.destinationLocation join fetch transfer.requestedBy left join fetch transfer.receivedBy where transfer.status = :status" + InventoryAccessOrm.scope("transfer", "transfer") + " order by transfer.createdAt desc";
        if (!accessActor.atLeast(DomainEnums.UserRole.warehouse_crew)) jpql = jpql.replace(" order by", " and transfer.sourceLocation.accessPolicy is not null and transfer.destinationLocation.accessPolicy is not null and not exists (select l.id from InventoryTransferLine l where l.transfer = transfer and l.item.accessPolicy is null) order by");
        var query = entityManager.createQuery(jpql, InventoryTransfer.class);
        if (status != null && !status.isBlank()) query.setParameter("status", DomainEnums.TransferStatus.valueOf(status));
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
    public List<InventoryTransferLine> lines(Collection<InventoryTransfer> transfers) {
        if (transfers.isEmpty()) return List.of();
        return entityManager.createQuery("select line from InventoryTransferLine line join fetch line.item left join fetch line.assetInstance left join fetch line.lot where line.transfer in :transfers order by line.createdAt", InventoryTransferLine.class)
                .setParameter("transfers", transfers).getResultList();
    }
    public List<InventoryTransferLine> lockedLines(InventoryTransfer transfer) {
        return entityManager.createQuery("select line from InventoryTransferLine line join fetch line.item left join fetch line.assetInstance left join fetch line.lot where line.transfer = :transfer order by line.createdAt", InventoryTransferLine.class)
                .setParameter("transfer", transfer).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList().stream().map(value -> accessActor.protect(value, true)).toList();
    }
    public InventoryTransfer byIdempotencyKey(UUID key) {
        return entityManager.createQuery("from InventoryTransfer transfer where transfer.idempotencyKey = :key", InventoryTransfer.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }
    public boolean numberExists(String number) {
        return entityManager.createQuery("select count(transfer) from InventoryTransfer transfer where lower(transfer.transferNumber) = :number", Long.class)
                .setParameter("number", number.toLowerCase(Locale.ROOT)).getSingleResult() > 0;
    }
    public boolean commandApplied(UUID transferId, UUID commandId) {
        return entityManager.createQuery("select count(tx) from StockTransaction tx where tx.relatedEntityType = 'inventory_transfer' and tx.relatedEntityId = :transferId and tx.clientCommandId = :commandId", Long.class)
                .setParameter("transferId", transferId).setParameter("commandId", commandId)
                .getSingleResult() > 0;
    }
    public InventoryPosition lockedPosition(Item item, StorageLocation location, InventoryLot lot) {
        var jpql = lot == null
                ? "from InventoryPosition position where position.item = :item and position.location = :location and position.lot is null"
                : "from InventoryPosition position where position.item = :item and position.location = :location and position.lot = :lot";
        var query = entityManager.createQuery(jpql, InventoryPosition.class)
                .setParameter("item", item).setParameter("location", location);
        if (lot != null) query.setParameter("lot", lot);
        return query.setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultStream().findFirst().orElse(null);
    }
}
