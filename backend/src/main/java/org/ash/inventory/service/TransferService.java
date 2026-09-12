package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.TransferOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.TransferDtos;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class TransferService {
    private final TransferOrm orm;
    private final ActorService actors;
    private final DomainEventService events;

    public TransferService(TransferOrm orm, ActorService actors, DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
    }

    @Transactional
    public List<TransferDtos.TransferResponse> list(String status, int page, int size) {
        actors.requireWarehouse();
        try { return responses(orm.transfers(status, offset(page, size), size)); }
        catch (IllegalArgumentException exception) { throw ApiException.badRequest("Unknown transfer status"); }
    }

    @Transactional
    public TransferDtos.TransferResponse create(TransferDtos.TransferInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var existing = orm.byIdempotencyKey(input.idempotencyKey());
        if (existing != null) return responses(List.of(existing)).getFirst();
        var source = required(StorageLocation.class, input.sourceLocationId(), "Source location");
        var destination = required(StorageLocation.class, input.destinationLocationId(), "Destination location");
        if (!source.active || !destination.active) throw ApiException.conflict("Transfer locations must be active");
        if (source.id.equals(destination.id)) throw ApiException.badRequest("Transfer locations must differ");
        var transfer = new InventoryTransfer();
        transfer.transferNumber = uniqueNumber(input.transferNumber());
        transfer.sourceLocation = source;
        transfer.destinationLocation = destination;
        transfer.requestedBy = actor;
        transfer.idempotencyKey = input.idempotencyKey();
        transfer.notes = input.notes();
        orm.persist(transfer);
        var lines = new ArrayList<InventoryTransferLine>();
        var assets = new HashSet<UUID>();
        for (var lineInput : input.lines()) {
            var item = required(Item.class, lineInput.itemId(), "Item");
            var line = new InventoryTransferLine();
            line.transfer = transfer;
            line.item = item;
            line.requestedQuantity = lineInput.quantity();
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                if (lineInput.quantity() != 1 || lineInput.assetInstanceId() == null) {
                    throw ApiException.badRequest("Serialized transfer lines require exactly one asset");
                }
                if (!assets.add(lineInput.assetInstanceId())) throw ApiException.badRequest("An asset can occur only once per transfer");
                line.assetInstance = required(AssetInstance.class, lineInput.assetInstanceId(), "Asset");
                if (!line.assetInstance.item.id.equals(item.id)) throw ApiException.badRequest("Asset does not belong to transfer item");
                if (lineInput.lotId() != null) throw ApiException.badRequest("Serialized transfer lines cannot reference lots");
            } else {
                if (lineInput.assetInstanceId() != null) throw ApiException.badRequest("Bulk transfer lines cannot reference assets");
                if (item.trackingMode == DomainEnums.TrackingMode.lot_tracked) {
                    if (lineInput.lotId() == null) throw ApiException.badRequest("Lot is required for lot-tracked transfers");
                    line.lot = required(InventoryLot.class, lineInput.lotId(), "Inventory lot");
                    if (!line.lot.item.id.equals(item.id)) throw ApiException.badRequest("Lot does not belong to transfer item");
                } else if (lineInput.lotId() != null) {
                    throw ApiException.badRequest("Bulk transfer lines cannot reference lots");
                }
            }
            orm.persist(line);
            lines.add(line);
        }
        events.record("transfer.requested", "inventory_transfer", transfer.id, actor.id,
                input.idempotencyKey(), Map.of("transferNumber", transfer.transferNumber));
        return response(transfer, lines);
    }

    @Transactional
    public TransferDtos.TransferResponse dispatch(UUID id, TransferDtos.CommandInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var transfer = requiredLocked(InventoryTransfer.class, id, "Transfer");
        if (orm.commandApplied(id, input.idempotencyKey())) {
            return response(transfer, orm.lockedLines(transfer));
        }
        if (transfer.status == DomainEnums.TransferStatus.in_transit) return response(transfer, orm.lockedLines(transfer));
        if (transfer.status != DomainEnums.TransferStatus.requested && transfer.status != DomainEnums.TransferStatus.picking) {
            throw ApiException.conflict("Transfer cannot be dispatched from status " + transfer.status);
        }
        var lines = orm.lockedLines(transfer);
        for (var line : lines) {
            if (line.assetInstance != null) {
                var asset = requiredLocked(AssetInstance.class, line.assetInstance.id, "Asset");
                if (asset.availabilityStatus != DomainEnums.AssetState.available
                        || asset.currentLocation == null || !asset.currentLocation.id.equals(transfer.sourceLocation.id)) {
                    throw ApiException.conflict("Asset " + asset.assetCode + " is not available at the source location");
                }
                asset.availabilityStatus = DomainEnums.AssetState.in_transit;
                asset.currentLocation = null;
            } else {
                var position = orm.lockedPosition(line.item, transfer.sourceLocation, line.lot);
                if (position == null || position.availableQuantity() < line.requestedQuantity) {
                    throw ApiException.conflict("Insufficient source stock for " + line.item.name);
                }
                position.quantityOnHand -= line.requestedQuantity;
                position.quantityInTransit += line.requestedQuantity;
            }
            line.pickedQuantity = line.requestedQuantity;
            transaction(transfer, line, DomainEnums.TransactionType.transfer_out, line.pickedQuantity,
                    transfer.sourceLocation, null, derivedKey(input.idempotencyKey(), line.id + ":out"),
                    input.idempotencyKey(), actor);
        }
        transfer.status = DomainEnums.TransferStatus.in_transit;
        transfer.dispatchedAt = Instant.now();
        if (input.notes() != null) transfer.notes = input.notes();
        events.record("transfer.dispatched", "inventory_transfer", transfer.id, actor.id,
                input.idempotencyKey(), Map.of("transferNumber", transfer.transferNumber));
        return response(transfer, lines);
    }

    @Transactional
    public TransferDtos.TransferResponse receive(UUID id, TransferDtos.ReceiveInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var transfer = requiredLocked(InventoryTransfer.class, id, "Transfer");
        if (orm.commandApplied(id, input.idempotencyKey())) {
            return response(transfer, orm.lockedLines(transfer));
        }
        if (transfer.status == DomainEnums.TransferStatus.received) return response(transfer, orm.lockedLines(transfer));
        if (transfer.status != DomainEnums.TransferStatus.in_transit
                && transfer.status != DomainEnums.TransferStatus.partially_received) {
            throw ApiException.conflict("Transfer is not in transit");
        }
        var lines = orm.lockedLines(transfer);
        var byId = new LinkedHashMap<UUID, InventoryTransferLine>();
        lines.forEach(line -> byId.put(line.id, line));
        var seen = new HashSet<UUID>();
        for (var received : input.lines()) {
            if (!seen.add(received.transferLineId())) throw ApiException.badRequest("A transfer line can occur only once");
            var line = byId.get(received.transferLineId());
            if (line == null) throw ApiException.badRequest("Receive line does not belong to transfer");
            int accounted;
            try { accounted = Math.addExact(received.receivedQuantity(), received.discrepancyQuantity()); }
            catch (ArithmeticException exception) { throw ApiException.badRequest("Receive quantities are too large"); }
            int outstanding = line.pickedQuantity - line.receivedQuantity - line.discrepancyQuantity;
            if (accounted < 1 || accounted > outstanding) throw ApiException.conflict("Receive quantity exceeds in-transit quantity");
            if (line.assetInstance != null && accounted != 1) throw ApiException.badRequest("Serialized transfer receipt must account for one asset");
            receiveLine(transfer, line, received, actor, input.idempotencyKey());
        }
        boolean complete = lines.stream().allMatch(line ->
                line.receivedQuantity + line.discrepancyQuantity == line.pickedQuantity);
        transfer.status = complete ? DomainEnums.TransferStatus.received : DomainEnums.TransferStatus.partially_received;
        transfer.receivedBy = actor;
        if (complete) transfer.receivedAt = Instant.now();
        if (input.notes() != null) transfer.notes = input.notes();
        events.record("transfer.received", "inventory_transfer", transfer.id, actor.id,
                input.idempotencyKey(), Map.of("transferNumber", transfer.transferNumber, "complete", complete));
        return response(transfer, lines);
    }

    @Transactional
    public TransferDtos.TransferResponse cancel(UUID id, TransferDtos.CommandInput input) {
        actors.requireWarehouse();
        var transfer = requiredLocked(InventoryTransfer.class, id, "Transfer");
        if (transfer.status == DomainEnums.TransferStatus.cancelled) return response(transfer, orm.lockedLines(transfer));
        if (transfer.status != DomainEnums.TransferStatus.requested && transfer.status != DomainEnums.TransferStatus.picking) {
            throw ApiException.conflict("Only an undispatched transfer can be cancelled");
        }
        transfer.status = DomainEnums.TransferStatus.cancelled;
        if (input.notes() != null) transfer.notes = input.notes();
        events.record("transfer.cancelled", "inventory_transfer", transfer.id, actors.current().id,
                input.idempotencyKey(), Map.of("transferNumber", transfer.transferNumber));
        return response(transfer, orm.lockedLines(transfer));
    }

    private void receiveLine(InventoryTransfer transfer, InventoryTransferLine line,
            TransferDtos.ReceiveLineInput input, UserAccount actor, UUID commandId) {
        if (line.assetInstance != null) {
            var asset = requiredLocked(AssetInstance.class, line.assetInstance.id, "Asset");
            if (asset.availabilityStatus != DomainEnums.AssetState.in_transit) {
                throw ApiException.conflict("Asset " + asset.assetCode + " is not in transit");
            }
            if (input.receivedQuantity() == 1) {
                asset.availabilityStatus = DomainEnums.AssetState.available;
                asset.currentLocation = transfer.destinationLocation;
            } else {
                asset.availabilityStatus = DomainEnums.AssetState.lost;
                asset.conditionStatus = DomainEnums.ConditionStatus.lost;
            }
        } else {
            var source = orm.lockedPosition(line.item, transfer.sourceLocation, line.lot);
            if (source == null || source.quantityInTransit < input.receivedQuantity() + input.discrepancyQuantity()) {
                throw ApiException.conflict("In-transit position no longer matches transfer");
            }
            source.quantityInTransit -= input.receivedQuantity() + input.discrepancyQuantity();
            if (input.receivedQuantity() > 0) {
                var destination = orm.lockedPosition(line.item, transfer.destinationLocation, line.lot);
                if (destination == null) {
                    destination = new InventoryPosition();
                    destination.item = line.item;
                    destination.location = transfer.destinationLocation;
                    destination.lot = line.lot;
                    orm.persist(destination);
                }
                destination.quantityOnHand += input.receivedQuantity();
            }
        }
        line.receivedQuantity += input.receivedQuantity();
        line.discrepancyQuantity += input.discrepancyQuantity();
        line.discrepancyNotes = input.discrepancyNotes();
        if (input.receivedQuantity() > 0) {
            transaction(transfer, line, DomainEnums.TransactionType.transfer_in, input.receivedQuantity(),
                    null, transfer.destinationLocation, derivedKey(commandId, line.id + ":in:" + line.receivedQuantity),
                    commandId, actor);
        }
        if (input.discrepancyQuantity() > 0) {
            transaction(transfer, line, DomainEnums.TransactionType.missing, input.discrepancyQuantity(),
                    null, null, derivedKey(commandId, line.id + ":missing:" + line.discrepancyQuantity),
                    commandId, actor);
        }
    }

    private void transaction(InventoryTransfer transfer, InventoryTransferLine line,
            DomainEnums.TransactionType type, int quantity, StorageLocation source, StorageLocation destination,
            UUID key, UUID commandId, UserAccount actor) {
        var tx = new StockTransaction();
        tx.item = line.item;
        tx.assetInstance = line.assetInstance;
        tx.user = actor;
        tx.type = type;
        tx.quantity = quantity;
        tx.sourceLocation = source;
        tx.destinationLocation = destination;
        tx.relatedEntityType = "inventory_transfer";
        tx.relatedEntityId = transfer.id;
        tx.reason = "Transfer " + transfer.transferNumber;
        tx.idempotencyKey = key;
        tx.clientCommandId = commandId;
        orm.persist(tx);
    }

    private List<TransferDtos.TransferResponse> responses(List<InventoryTransfer> values) {
        var byTransfer = new LinkedHashMap<UUID, List<InventoryTransferLine>>();
        orm.lines(values).forEach(line -> byTransfer.computeIfAbsent(line.transfer.id, ignored -> new ArrayList<>()).add(line));
        return values.stream().map(value -> response(value, byTransfer.getOrDefault(value.id, List.of()))).toList();
    }

    private TransferDtos.TransferResponse response(InventoryTransfer value, List<InventoryTransferLine> lines) {
        return new TransferDtos.TransferResponse(value.id, value.transferNumber, value.sourceLocation.id,
                value.destinationLocation.id, value.status.name(), value.requestedBy.id,
                value.receivedBy == null ? null : value.receivedBy.id, value.dispatchedAt, value.receivedAt,
                value.idempotencyKey, value.notes, lines.stream().map(line -> new TransferDtos.TransferLineResponse(
                        line.id, line.item.id, line.item.name,
                        line.assetInstance == null ? null : line.assetInstance.id,
                        line.assetInstance == null ? null : line.assetInstance.assetCode,
                        line.lot == null ? null : line.lot.id, line.requestedQuantity, line.pickedQuantity,
                        line.receivedQuantity, line.discrepancyQuantity, line.discrepancyNotes)).toList());
    }

    private String uniqueNumber(String requested) {
        var value = requested == null || requested.isBlank()
                ? "TR-" + LocalDate.now().getYear() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT)
                : requested.trim();
        if (orm.numberExists(value)) throw ApiException.conflict("Transfer number already exists");
        return value;
    }
    private UUID derivedKey(UUID base, String suffix) {
        return UUID.nameUUIDFromBytes((base + ":" + suffix).getBytes(StandardCharsets.UTF_8));
    }
    private int offset(int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        try { return Math.multiplyExact(page, size); }
        catch (ArithmeticException exception) { throw ApiException.badRequest("Page offset is too large"); }
    }
    private <T> T required(Class<T> type, UUID id, String label) {
        var value = orm.find(type, id); if (value == null) throw ApiException.notFound(label + " not found"); return value;
    }
    private <T> T requiredLocked(Class<T> type, UUID id, String label) {
        var value = orm.locked(type, id); if (value == null) throw ApiException.notFound(label + " not found"); return value;
    }
}
