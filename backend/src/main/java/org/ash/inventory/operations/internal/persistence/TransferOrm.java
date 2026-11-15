package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.contract.dto.TaskFilters;

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

    public List<InventoryTransfer> transfers(TaskFilters filters, int offset, int limit) {
        var predicates = new TaskQuery("select transfer from InventoryTransfer transfer join fetch transfer.sourceLocation join fetch transfer.destinationLocation join fetch transfer.requestedBy left join fetch transfer.receivedBy where 1=1"
                + InventoryAccessOrm.scope("transfer", "transfer"));
        if (!accessActor.atLeast(DomainEnums.UserRole.warehouse_crew)) predicates.where("transfer.sourceLocation.accessPolicy is not null and transfer.destinationLocation.accessPolicy is not null and not exists (select l.id from InventoryTransferLine l where l.transfer = transfer and l.item.accessPolicy is null)");
        predicates.status("transfer.status", filters.status, DomainEnums.TransferStatus.class,
                List.of(DomainEnums.TransferStatus.received, DomainEnums.TransferStatus.cancelled));
        predicates.searchWhere(filters.search, "(lower(transfer.transferNumber) like :search escape '!' or lower(transfer.sourceLocation.name) like :search escape '!' or lower(transfer.destinationLocation.name) like :search escape '!' or lower(transfer.notes) like :search escape '!' or exists (select line.id from InventoryTransferLine line left join line.assetInstance asset left join line.lot lot where line.transfer = transfer and (lower(line.item.name) like :search escape '!' or lower(line.item.sku) like :search escape '!' or lower(asset.assetCode) like :search escape '!' or lower(lot.lotNumber) like :search escape '!')))");
        if (filters.locationId != null) predicates.parameter("locationId", filters.locationId).where("(transfer.sourceLocation.id = :locationId or transfer.destinationLocation.id = :locationId)");
        if (filters.itemId != null) predicates.parameter("itemId", filters.itemId).where("exists (select line.id from InventoryTransferLine line where line.transfer = transfer and line.item.id = :itemId)");
        var query = predicates.bind(entityManager.createQuery(predicates.ordered("transfer.createdAt desc, transfer.id desc"), InventoryTransfer.class));
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
