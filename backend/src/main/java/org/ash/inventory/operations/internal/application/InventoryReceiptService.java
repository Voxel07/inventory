package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DamageReport;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.InventoryReceiptOrm;
import org.ash.inventory.operations.internal.persistence.ItemLocks;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.*;
/** Inventory owns receipt effects; the purchasing document is identified only by values. */
@ApplicationScoped
public class InventoryReceiptService {
    @Inject InventoryReceiptOrm orm;
    @Inject ItemLocks itemLocks;
    @Inject ActorService actors;
    @Inject CategoryMaintenanceService categoryDefaults;
    public record ReceiptStock(UUID id, String receiptNumber, UUID idempotencyKey, UUID lineId,
            UUID itemId, UUID lotId, UUID locationId, int receivedQuantity, int damagedQuantity, List<String> assetCodes) {
        public ReceiptStock { assetCodes = assetCodes == null ? List.of() : List.copyOf(assetCodes); }
    }
    private record Received(Item item, InventoryLot lot, int receivedQuantity, int damagedQuantity) {}
    /** Locks every receipt item in canonical order before any position lock, like all multi-item stock commands. */
    @Transactional(Transactional.TxType.MANDATORY)
    public void receive(List<ReceiptStock> lines) {
        actors.requireWarehouse();
        itemLocks.lock(lines.stream().map(ReceiptStock::itemId).distinct().toList());
        lines.forEach(this::receiveLine);
    }
    private void receiveLine(ReceiptStock input) {
        if (input.receivedQuantity() < 0 || input.damagedQuantity() < 0
                || (long) input.receivedQuantity() + input.damagedQuantity() > Integer.MAX_VALUE)
            throw ApiException.badRequest("Invalid receipt quantities");
        var item = orm.requireLockedFresh(Item.class, input.itemId(), "Item");
        var location = orm.require(StorageLocation.class, input.locationId(), "Receiving location");
        LocationHierarchyService.requireActiveStockLocation(location);
        var lot = input.lotId() == null ? null : orm.require(InventoryLot.class, input.lotId(), "Lot");
        if (lot != null && !lot.item.id.equals(item.id)) throw ApiException.badRequest("Lot does not belong to receipt item");
        int quantity = Math.addExact(input.receivedQuantity(), input.damagedQuantity());
        if (item.trackingMode == DomainEnums.TrackingMode.serialized && input.assetCodes().size() != quantity)
            throw ApiException.badRequest("Provide one asset code per received unit");
        if (item.trackingMode == DomainEnums.TrackingMode.lot_tracked && lot == null)
            throw ApiException.badRequest("Lot is required for lot-tracked receipts");
        book(input, new Received(item, lot, input.receivedQuantity(), input.damagedQuantity()), location, input.assetCodes(), actors.current());
    }
    private void book(ReceiptStock receipt, Received line, StorageLocation location,
            List<String> assetCodes, UserAccount actor) {
        int stockReceived = line.receivedQuantity + line.damagedQuantity;
        if (line.item.trackingMode == DomainEnums.TrackingMode.serialized) {
            for (int index = 0; index < stockReceived; index++) {
                var asset = new AssetInstance();
                asset.item = line.item;
                asset.assetCode = assetCodes.get(index).trim().toUpperCase(Locale.ROOT);
                asset.currentLocation = location;
                boolean damaged = index >= line.receivedQuantity;
                asset.conditionStatus = damaged ? DomainEnums.ConditionStatus.damaged : DomainEnums.ConditionStatus.good;
                asset.availabilityStatus = damaged ? DomainEnums.AssetState.damaged : DomainEnums.AssetState.available;
                orm.persist(asset);
                categoryDefaults.apply(asset.item);
                appendTransaction(receipt, line, asset, location, DomainEnums.TransactionType.received, 1,
                        derivedKey(receipt.idempotencyKey(), receipt.lineId() + ":received:" + index), actor);
                if (damaged) recordReceiptDamage(receipt, line, asset, actor, index);
            }
            return;
        }
        if (stockReceived > 0) {
            var position = orm.lockedPosition(line.item, location, line.lot);
            if (position == null) {
                position = new InventoryPosition();
                position.item = line.item;
                position.location = location;
                position.lot = line.lot;
                orm.persist(position);
            }
            position.quantityOnHand += stockReceived;
            position.quantityDamaged += line.damagedQuantity;
            appendTransaction(receipt, line, null, location, DomainEnums.TransactionType.received,
                    stockReceived, derivedKey(receipt.idempotencyKey(), receipt.lineId() + ":received"), actor);
            if (line.damagedQuantity > 0) recordReceiptDamage(receipt, line, null, actor, 0);
        }
    }

    private void recordReceiptDamage(ReceiptStock receipt, Received line, AssetInstance asset,
            UserAccount actor, int index) {
        var location = orm.require(StorageLocation.class, receipt.locationId(), "Receiving location");
        var damage = new DamageReport();
        damage.item = line.item;
        damage.assetInstance = asset;
        damage.reporter = actor;
        damage.quantity = asset == null ? line.damagedQuantity : 1;
        damage.description = "Damaged on receipt " + receipt.receiptNumber();
        damage.severity = DomainEnums.DamageSeverity.medium;
        damage.idempotencyKey = derivedKey(receipt.idempotencyKey(),
                receipt.lineId() + ":damage:" + index);
        if (asset == null) {
            var position = orm.lockedPosition(line.item, location, line.lot);
            if (position != null) damage.positionQuantities = Map.of(position.id.toString(), damage.quantity);
        }
        orm.persist(damage);
        appendTransaction(receipt, line, asset, location, DomainEnums.TransactionType.damaged,
                damage.quantity, derivedKey(receipt.idempotencyKey(),
                        receipt.lineId() + ":damage-transaction:" + index), actor).damageReport = damage;
    }

    private StockTransaction appendTransaction(ReceiptStock receipt, Received line, AssetInstance asset,
            StorageLocation location, DomainEnums.TransactionType type, int quantity, UUID key, UserAccount actor) {
        var transaction = new StockTransaction();
        transaction.item = line.item;
        transaction.assetInstance = asset;
        transaction.user = actor;
        transaction.type = type;
        transaction.quantity = quantity;
        transaction.destinationLocation = location;
        transaction.relatedEntityType = "goods_receipt";
        transaction.relatedEntityId = receipt.id();
        transaction.reason = "Goods receipt " + receipt.receiptNumber();
        transaction.idempotencyKey = key;
        transaction.clientCommandId = receipt.idempotencyKey();
        orm.persist(transaction);
        return transaction;
    }

    private UUID derivedKey(UUID base, String suffix) {
        return UUID.nameUUIDFromBytes((base + ":" + suffix).getBytes(StandardCharsets.UTF_8));
    }
}
