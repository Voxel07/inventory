package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.persistence.OperationsOrm;
import org.ash.inventory.operations.internal.persistence.StockFactsOrm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.*;
/** Authoritative request-local stock facts; never invokes a command workflow. */
@ApplicationScoped
public class StockReadService {
    @Inject OperationsOrm orm;
    @Inject PositionService positions;
    @Inject EquipmentReadService readPolicy;
    @Inject StockFactsOrm stockFacts;
    public StockState physicalStock(Item item) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            var assets = orm.assetsForItem(item);
            return calculateAssetStock(assets);
        }
        return ledgerStock(orm.transactionTotals(item), orm.unresolvedDamageQuantity(item),
                orm.activeReservationQuantity(item), positions.blocked(item), positions.inTransit(item));
    }

    public record ReadStock(StockState physical, EquipmentReadService.Facts policy) {}

    public Map<UUID, ReadStock> readStock(List<Item> items) {
        if (items.isEmpty()) return Map.of();
        var itemIds = items.stream().map(item -> item.id).toList();
        var facts = stockFacts.load(itemIds);
        var transactionTotals = facts.totals();
        var damageQuantities = facts.damage();
        var reservationQuantities = facts.reservations();
        var positionsByItem = positions.load(itemIds);
        var serializedAssets = orm.assetsForItems(items.stream()
                .filter(i -> i.trackingMode == DomainEnums.TrackingMode.serialized)
                .map(i -> i.id).toList());
        var assetsByItem = new LinkedHashMap<UUID, List<org.ash.inventory.operations.internal.model.AssetInstance>>();
        for (var asset : serializedAssets) {
            assetsByItem.computeIfAbsent(asset.item.id, ignored -> new ArrayList<>()).add(asset);
        }
        var policies = readPolicy.load(items, assetsByItem, positionsByItem, facts.memberDamage());

        var result = new LinkedHashMap<UUID, StockState>();
        for (var item : items) {
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                result.put(item.id, calculateAssetStock(assetsByItem.getOrDefault(item.id, List.of())));
            } else {
                result.put(item.id, ledgerStock(
                        transactionTotals.getOrDefault(item.id, Map.of()),
                        Math.toIntExact(damageQuantities.getOrDefault(item.id, 0L)),
                        Math.toIntExact(reservationQuantities.getOrDefault(item.id, 0L)),
                        PositionService.blocked(item, positionsByItem.getOrDefault(item.id, List.of())),
                        positionsByItem.getOrDefault(item.id, List.of()).stream().mapToInt(p -> p.quantityInTransit).sum()
                ));
            }
        }
        var reads = new LinkedHashMap<UUID, ReadStock>();
        result.forEach((id, state) -> reads.put(id, new ReadStock(state, policies.get(id))));
        return reads;
    }

    StockState physicalStock(Item item, Map<DomainEnums.TransactionType, Long> totals,
            int damaged, int reserved, int blocked, int inTransit, List<AssetInstance> assets) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            return calculateAssetStock(assets);
        }
        return ledgerStock(totals, damaged, reserved, blocked, inTransit);
    }

    private StockState calculateAssetStock(List<org.ash.inventory.operations.internal.model.AssetInstance> assets) {
        int onHand = 0;
        int checkedOut = 0;
        int damaged = 0;
        int reserved = 0;
        int available = 0;
        int inTransit = 0;
        for (var asset : assets) {
            var state = StockPolicy.classify(asset);
            onHand += state.onHand(); checkedOut += state.checkedOut(); inTransit += state.inTransit();
            damaged += state.damaged(); reserved += state.reserved(); available += state.available();
        }
        return new StockState(onHand, checkedOut, inTransit, damaged, reserved, available);
    }

    private StockState ledgerStock(Map<DomainEnums.TransactionType, Long> totals, int damaged, int reserved, int blocked, int inTransit) {
        int onHand = quantity(totals, DomainEnums.TransactionType.added)
                + quantity(totals, DomainEnums.TransactionType.received)
                + quantity(totals, DomainEnums.TransactionType.adjusted)
                + quantity(totals, DomainEnums.TransactionType.checkin)
                + quantity(totals, DomainEnums.TransactionType.transfer_in)
                - quantity(totals, DomainEnums.TransactionType.checkout)
                - quantity(totals, DomainEnums.TransactionType.written_off)
                - quantity(totals, DomainEnums.TransactionType.transfer_out);
        int checkedOut = quantity(totals, DomainEnums.TransactionType.checkout)
                - quantity(totals, DomainEnums.TransactionType.checkin)
                - quantity(totals, DomainEnums.TransactionType.consumed)
                - quantity(totals, DomainEnums.TransactionType.missing);
        return new StockState(Math.max(0, onHand), Math.max(0, checkedOut), inTransit, damaged, reserved,
                Math.max(0, onHand - damaged - reserved - blocked));
    }

    private int quantity(Map<DomainEnums.TransactionType, Long> totals, DomainEnums.TransactionType type) {
        return Math.toIntExact(totals.getOrDefault(type, 0L));
    }

}
