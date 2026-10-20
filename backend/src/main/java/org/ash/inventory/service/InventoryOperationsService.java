package org.ash.inventory.service;

import org.ash.inventory.model.RuntimeEntry;

import org.ash.inventory.helper.Inputs;
import org.ash.inventory.helper.BusinessTime;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.CustodyHandover;
import org.ash.inventory.model.InventoryOrder;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.MaintenanceSchedule;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.CustodyOrm;
import org.ash.inventory.orm.OperationsOrm;
import org.ash.inventory.orm.PurchasingOrm;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Comparator;
import java.util.UUID;

@ApplicationScoped
public class InventoryOperationsService {
    @jakarta.inject.Inject RuntimeService runtime;
    @jakarta.inject.Inject org.ash.inventory.helper.storage.MediaService media;
    @jakarta.inject.Inject EquipmentService equipment;
    @jakarta.inject.Inject PositionService positions;
    @jakarta.inject.Inject MaintenanceEvaluationService maintenance;
    @jakarta.inject.Inject EquipmentReadService readPolicy;
    @jakarta.inject.Inject CustodyOrm custody;
    @jakarta.inject.Inject org.ash.inventory.orm.ItemLocks itemLocks;
    private static final List<DomainEnums.TransactionType> DIRECT_TRANSACTION_TYPES = List.of(
            DomainEnums.TransactionType.checkout,
            DomainEnums.TransactionType.checkin,
            DomainEnums.TransactionType.added,
            DomainEnums.TransactionType.adjusted);
    private final OperationsOrm orm;
    private final PurchasingOrm purchasingOrm;
    private final ActorService actors;
    private final DomainEventService events;

    public InventoryOperationsService(OperationsOrm orm, PurchasingOrm purchasingOrm, ActorService actors, DomainEventService events) {
        this.orm = orm;
        this.purchasingOrm = purchasingOrm;
        this.actors = actors;
        this.events = events;
    }

    public record StockState(int onHand, int checkedOut, int inTransit, int damaged, int reserved, int available) {
        public int totalOwned() {
            return onHand + checkedOut + inTransit;
        }
    }

    /** The interceptor authorizes every referenced private resource across the whole batch. */
    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public List<StockTransaction> transactBatch(List<ApiModels.TransactionInput> inputs) {
        actors.requireWarehouse();
        if (inputs == null || inputs.isEmpty() || inputs.size() > 200) throw ApiException.badRequest("Provide 1 to 200 transactions");
        itemLocks.lock(inputs.stream().map(ApiModels.TransactionInput::itemId).filter(java.util.Objects::nonNull).distinct().toList());
        return inputs.stream().sorted(java.util.Comparator.comparing(ApiModels.TransactionInput::itemId)).map(this::transact).toList();
    }

    /** Direct stock command; authorization follows the transaction type (checkout: ASH, otherwise item edit). */
    @Transactional
    public StockTransaction transact(ApiModels.TransactionInput input) {
        return input.transactionType() == DomainEnums.TransactionType.checkout
                ? checkout(input) : transactInventory(input);
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public StockTransaction checkout(ApiModels.TransactionInput input) {
        actors.requireTakeout();
        if (input.transactionType() != DomainEnums.TransactionType.checkout) throw ApiException.badRequest("Checkout transaction required");
        return recordTransaction(input);
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public StockTransaction transactInventory(ApiModels.TransactionInput input) {
        if (input.transactionType() == DomainEnums.TransactionType.checkout) throw ApiException.badRequest("Use the checkout workflow");
        return recordTransaction(input);
    }

    private void requireTransactionAccess(Item item, ApiModels.TransactionInput input) {
        if (input.transactionType() == DomainEnums.TransactionType.checkout) actors.requireItemAccess(item);
        else actors.requireItemEdit(item);
    }

    private StockTransaction recordTransaction(ApiModels.TransactionInput input) {
        var actor = actors.current();
        var occurredAt = historicalTimestamp(input.occurredAt());
        if (!DIRECT_TRANSACTION_TYPES.contains(input.transactionType())) {
            throw ApiException.badRequest("Transaction type " + input.transactionType()
                    + " must be created by its owning inventory workflow");
        }
        if (input.idempotencyKey() != null) {
            requireTransactionAccess(orm.find(Item.class, input.itemId()), input);
            var existing = orm.transactionByIdempotencyKey(input.idempotencyKey());
            if (existing != null) {
                actors.protect(existing, true);
                if (!existing.item.id.equals(input.itemId())) throw ApiException.conflict("Idempotency key belongs to a different item");
                return existing;
            }
        }
        var item = lockedItem(input.itemId());
        requireTransactionAccess(item, input);
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            return transactSerialized(input, item, actor, occurredAt);
        }
        if (input.assetInstanceId() != null)
            throw ApiException.badRequest("assetInstanceId can only be used with serialized items");
        var state = stock(item);
        if (input.transactionType() == DomainEnums.TransactionType.checkout) {
            var event = transactionEvent(input);
            requireCheckoutContext(input, event);
            assertCheckoutAllowed(item);
            equipment.assertPickup(item, event);
            int available = availableFor(item, event, 0);
            if (input.quantityChanged() > available)
                throw ApiException.conflict("Only " + available + " units are available for this commitment/event");
        }
        if (input.transactionType() == DomainEnums.TransactionType.checkin
                && input.quantityChanged() > state.checkedOut()) {
            throw ApiException.conflict("Only " + state.checkedOut() + " units are checked out");
        }
        var transaction = new StockTransaction();
        transaction.occurredAt = occurredAt;
        transaction.item = item;
        transaction.user = input.userId() == null ? actor : orm.require(UserAccount.class, input.userId(), "User");
        transaction.type = input.transactionType();
        transaction.quantity = input.quantityChanged();
        transaction.reason = input.reason();
        transaction.notes = input.notes();
        transaction.eventOccurrence = transactionEvent(input);
        transaction.eventType = transaction.eventOccurrence == null
                ? Inputs.blankToNull(input.eventType()) : transaction.eventOccurrence.eventType;
        transaction.faction = Inputs.blankToNull(input.faction());
        transaction.idempotencyKey = input.idempotencyKey();
        transaction.clientCommandId = input.idempotencyKey();
        if (input.transactionType() == DomainEnums.TransactionType.checkin) {
            settleDirectCustody(transaction, null, input);
        }
        switch (input.transactionType()) {
            case added, received, adjusted, checkin, transfer_in -> transaction.destinationLocation = input.transactionType() == DomainEnums.TransactionType.checkin && item.returnLocation != null ? item.returnLocation : item.storageLocation;
            case checkout, transfer_out, written_off -> transaction.sourceLocation = item.storageLocation;
            default -> { }
        }
        transaction.lot = positions.lot(item, input.lotId());
        if (input.locationId() != null) {
            if (input.transactionType() == DomainEnums.TransactionType.checkout) transaction.sourceLocation = positions.location(input.locationId());
            else transaction.destinationLocation = positions.location(input.locationId());
        }
        transaction.availabilityBefore = state.available();
        positions.apply(transaction);
        orm.persist(transaction);
        transaction.availabilityAfter = stock(item).available();
        if (transaction.type == DomainEnums.TransactionType.checkout && item.consumable()) consumeOnCheckout(transaction);
        events.record("stock.changed", "item", item.id, actor.id, input.idempotencyKey(),
                Map.of("itemId", item.id.toString(), "type", transaction.type.name(), "quantity", transaction.quantity));
        return transaction;
    }

    /** Consumables are used up, never returned: a direct checkout is consumed at once, so no checked-out stock or custody remains. */
    private void consumeOnCheckout(StockTransaction checkout) {
        var consumed = new StockTransaction();
        consumed.occurredAt = checkout.occurredAt;
        consumed.item = checkout.item;
        consumed.user = checkout.user;
        consumed.type = DomainEnums.TransactionType.consumed;
        consumed.quantity = checkout.quantity;
        consumed.reason = checkout.reason;
        consumed.notes = checkout.notes;
        consumed.eventOccurrence = checkout.eventOccurrence;
        consumed.eventType = checkout.eventType;
        consumed.faction = checkout.faction;
        consumed.lot = checkout.lot;
        consumed.clientCommandId = checkout.clientCommandId;
        consumed.availabilityBefore = checkout.availabilityAfter;
        consumed.availabilityAfter = checkout.availabilityAfter;
        // Strictly after its checkout (database precision is microseconds), so ledger order and reversal stay unambiguous.
        consumed.createdAt = checkout.createdAt.plusNanos(1_000);
        orm.persist(consumed);
    }

    static final String RESTOCK = "restock";

    /**
     * Unused consumables of one direct checkout go back to stock: a check-in and a negative consumption, both linked to
     * the checkout, so it keeps who issued them while the ledger names who brought them back. The total never exceeds
     * the issued quantity, and a repeated command returns the first result.
     */
    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public StockTransaction restockUnused(UUID checkoutId, ApiModels.RestockInput input) {
        if (input.idempotencyKey() != null) {
            var existing = orm.transactionByIdempotencyKey(input.idempotencyKey());
            if (existing != null) {
                actors.protect(existing, true);
                if (!checkoutId.equals(existing.relatedEntityId)) throw ApiException.conflict("Idempotency key belongs to a different movement");
                return existing;
            }
        }
        var checkout = orm.find(StockTransaction.class, checkoutId);
        if (checkout == null) throw ApiException.notFound("Checkout not found");
        var item = lockedItem(checkout.item.id);
        actors.requireItemEdit(item);
        if (checkout.type != DomainEnums.TransactionType.checkout || checkout.order != null || checkout.reverses != null || !item.consumable())
            throw ApiException.badRequest("Only a direct checkout of a consumable can be restocked");
        int restockable = checkout.quantity - orm.restockedQuantity(checkout);
        if (input.quantity() > restockable)
            throw ApiException.badRequest("Only " + restockable + " of " + item.name + " can still be restocked from this checkout");
        var actor = actors.current();
        var checkin = new StockTransaction();
        checkin.occurredAt = historicalTimestamp(null);
        checkin.item = item;
        checkin.user = actor;
        checkin.type = DomainEnums.TransactionType.checkin;
        checkin.quantity = input.quantity();
        checkin.reason = "Unused consumable restocked";
        checkin.notes = input.notes();
        checkin.eventOccurrence = checkout.eventOccurrence;
        checkin.eventType = checkout.eventType;
        checkin.faction = checkout.faction;
        checkin.lot = checkout.lot;
        checkin.relatedEntityType = RESTOCK;
        checkin.relatedEntityId = checkout.id;
        checkin.idempotencyKey = input.idempotencyKey();
        checkin.clientCommandId = input.idempotencyKey();
        checkin.destinationLocation = input.locationId() != null ? positions.location(input.locationId())
                : item.returnLocation != null ? item.returnLocation : item.storageLocation;
        checkin.availabilityBefore = stock(item).available();
        positions.apply(checkin);
        orm.persist(checkin);
        checkin.availabilityAfter = stock(item).available();
        var unconsumed = new StockTransaction();
        unconsumed.occurredAt = checkin.occurredAt;
        unconsumed.item = item;
        unconsumed.user = actor;
        unconsumed.type = DomainEnums.TransactionType.consumed;
        unconsumed.quantity = -input.quantity();
        unconsumed.reason = checkin.reason;
        unconsumed.notes = input.notes();
        unconsumed.eventOccurrence = checkin.eventOccurrence;
        unconsumed.eventType = checkin.eventType;
        unconsumed.faction = checkin.faction;
        unconsumed.lot = checkin.lot;
        unconsumed.relatedEntityType = RESTOCK;
        unconsumed.relatedEntityId = checkout.id;
        unconsumed.clientCommandId = input.idempotencyKey();
        unconsumed.availabilityBefore = checkin.availabilityAfter;
        unconsumed.availabilityAfter = checkin.availabilityAfter;
        unconsumed.createdAt = checkin.createdAt.plusNanos(1_000);
        orm.persist(unconsumed);
        events.record("stock.changed", "item", item.id, actor.id, input.idempotencyKey(),
                Map.of("itemId", item.id.toString(), "type", "restocked", "quantity", input.quantity()));
        return checkin;
    }

    /** Direct consumable checkouts of the item that can still take restocked units, newest first. */
    public List<ApiModels.RestockableCheckout> restockable(UUID itemId) {
        var item = orm.require(Item.class, itemId, "Item");
        actors.requireItemEdit(item);
        if (!item.consumable()) return List.of();
        return orm.directCheckouts(item, 100).stream().map(checkout -> new ApiModels.RestockableCheckout(checkout.id, checkout.occurredAt,
                        checkout.user.name, checkout.eventOccurrence == null ? null : checkout.eventOccurrence.name, checkout.faction,
                        checkout.quantity, orm.restockedQuantity(checkout)))
                .filter(row -> row.restocked() < row.issued()).toList();
    }

    private StockTransaction transactSerialized(ApiModels.TransactionInput input, Item item, UserAccount actor, Instant occurredAt) {
        if (input.transactionType() != DomainEnums.TransactionType.checkout
                && input.transactionType() != DomainEnums.TransactionType.checkin) {
            throw ApiException.conflict("Serialized stock changes must be made through individual asset records");
        }
        if (input.quantityChanged() != 1)
            throw ApiException.badRequest("A serialized asset transaction must have quantity 1");
        if (input.assetInstanceId() == null)
            throw ApiException.conflict("Select the serialized asset to " + input.transactionType().name());

        AssetInstance asset = orm.findLockedAsset(input.assetInstanceId());
        if (asset == null || !asset.active || !asset.item.id.equals(item.id))
            throw ApiException.notFound("Asset instance not found for this item");

        var before = stock(item).available();
        var transaction = new StockTransaction();
        transaction.occurredAt = occurredAt;
        transaction.item = item;
        transaction.assetInstance = asset;
        transaction.assetBefore.put("state",asset.availabilityStatus.name());
        transaction.assetBefore.put("version",Long.toString(asset.version));
        if(asset.currentLocation!=null) transaction.assetBefore.put("location",asset.currentLocation.id.toString());
        if(asset.currentCustodian!=null) transaction.assetBefore.put("custodian",asset.currentCustodian.id.toString());
        transaction.user = input.userId() == null ? actor : orm.require(UserAccount.class, input.userId(), "User");
        transaction.type = input.transactionType();
        transaction.quantity = 1;
        transaction.reason = input.reason();
        transaction.notes = input.notes();
        transaction.eventOccurrence = transactionEvent(input);
        transaction.eventType = transaction.eventOccurrence == null
                ? Inputs.blankToNull(input.eventType()) : transaction.eventOccurrence.eventType;
        transaction.faction = Inputs.blankToNull(input.faction());
        transaction.idempotencyKey = input.idempotencyKey();
        transaction.clientCommandId = input.idempotencyKey();
        transaction.availabilityBefore = before;

        if (input.transactionType() == DomainEnums.TransactionType.checkout) {
            requireCheckoutContext(input, transaction.eventOccurrence);
            assertCheckoutAllowed(item);
            assertAssetCheckoutAllowed(asset);
            equipment.assertPickup(item, transaction.eventOccurrence);
            equipment.assertAsset(asset, transaction.eventOccurrence);
            if (asset.availabilityStatus != DomainEnums.AssetState.available)
                throw ApiException.conflict("Asset " + asset.assetCode + " is not available");
            transaction.sourceLocation = asset.currentLocation == null ? item.storageLocation : asset.currentLocation;
            asset.availabilityStatus = DomainEnums.AssetState.in_field;
            asset.currentLocation = null;
            asset.currentCustodian = transaction.user;
        } else {
            if (asset.availabilityStatus != DomainEnums.AssetState.in_field
                    && asset.availabilityStatus != DomainEnums.AssetState.in_custody
                    && asset.availabilityStatus != DomainEnums.AssetState.returned_pending_check) {
                throw ApiException.conflict("Asset " + asset.assetCode + " is not checked out");
            }
            settleDirectCustody(transaction, asset, input);
            transaction.sourceLocation = asset.currentLocation;
            transaction.destinationLocation = input.locationId() == null ? (item.returnLocation == null ? item.storageLocation : item.returnLocation) : positions.location(input.locationId());
            asset.availabilityStatus = StockPolicy.returnedState(asset);
            asset.currentLocation = transaction.destinationLocation;
            asset.currentCustodian = null;
        }

        positions.apply(transaction);
        orm.persist(transaction);
        transaction.availabilityAfter = stock(item).available();
        var payload = new LinkedHashMap<String, Object>();
        payload.put("itemId", item.id.toString());
        payload.put("assetInstanceId", asset.id.toString());
        payload.put("assetCode", asset.assetCode);
        payload.put("type", transaction.type.name());
        payload.put("quantity", 1);
        events.record("stock.changed", "item", item.id, actor.id, input.idempotencyKey(), payload);
        return transaction;
    }


    /**
     * A direct check-in settles one exact direct custody (custodian and event). Order-held stock is settled by its
     * order reconciliation. The ledger row names the custodian; the operator stays in the audit event.
     */
    private void settleDirectCustody(StockTransaction transaction, AssetInstance asset, ApiModels.TransactionInput input) {
        var sources = custody.directSources(transaction.item.id, asset == null ? null : asset.id);
        if (asset != null) {
            if (sources.isEmpty()) throw ApiException.conflict("Asset " + asset.assetCode
                    + " is not in direct custody; return it through its order");
            var source = sources.getFirst();
            if (input.userId() != null && !input.userId().equals(source.user()))
                throw ApiException.conflict("Asset " + asset.assetCode + " is held by another custodian");
            if (input.eventOccurrenceId() != null && !input.eventOccurrenceId().equals(source.event()))
                throw ApiException.conflict("Asset " + asset.assetCode + " was checked out for another event");
            transaction.user = orm.require(UserAccount.class, source.user(), "User");
            transaction.eventOccurrence = source.event() == null ? null
                    : orm.require(org.ash.inventory.model.EventOccurrence.class, source.event(), "Event");
        } else {
            UUID event = transaction.eventOccurrence == null ? null : transaction.eventOccurrence.id;
            int held = sources.stream().filter(source -> source.user().equals(transaction.user.id)
                    && java.util.Objects.equals(source.event(), event)).mapToInt(CustodyOrm.DirectSource::quantity).sum();
            if (transaction.quantity > held) throw ApiException.conflict("Only " + held + " units are in the selected direct custody"
                    + (event == null ? " without event" : " for this event"));
        }
        if (transaction.eventOccurrence != null) transaction.eventType = transaction.eventOccurrence.eventType;
    }

    public void assertAssetCheckoutAllowed(AssetInstance asset) {
        if (asset.conditionStatus == DomainEnums.ConditionStatus.damaged
                || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe
                || asset.conditionStatus == DomainEnums.ConditionStatus.lost) {
            throw ApiException.conflict("Asset " + asset.assetCode + " is blocked because its condition is "
                    + asset.conditionStatus);
        }
        if (MaintenancePolicy.blocksAsset(asset, BusinessTime.today())) {
            throw ApiException.conflict("Asset " + asset.assetCode + " is blocked because its service status is "
                    + MaintenancePolicy.assetStatus(asset, BusinessTime.today()));
        }
        assertNoBlockingScheduleIsDue(asset.item, asset);
    }

    /** Event use names the faction; a checkout without event or event type is general (out-of-game) use. */
    private void requireCheckoutContext(ApiModels.TransactionInput input, org.ash.inventory.model.EventOccurrence event) {
        if (event != null || Inputs.blankToNull(input.eventType()) != null) requiredText(input.faction(), "faction");
    }

    private org.ash.inventory.model.EventOccurrence transactionEvent(ApiModels.TransactionInput input) {
        if (input.eventOccurrenceId() == null) return null;
        var event = orm.require(org.ash.inventory.model.EventOccurrence.class, input.eventOccurrenceId(), "Event");
        if (input.eventType() != null && !event.eventType.equals(input.eventType()))
            throw ApiException.badRequest("Event occurrence does not match event type");
        if (event.closed() && input.transactionType() == DomainEnums.TransactionType.checkout)
            throw ApiException.conflict("Event " + event.name + " is closed; correct its items on the event page instead");
        return event;
    }

    public StockState stock(Item item) {
        return withPolicy(item, physicalStock(item));
    }

    public int availableFor(Item item, org.ash.inventory.model.EventOccurrence event, int ownReservation) {
        return equipment.available(item, event, physicalStock(item), ownReservation);
    }

    private StockState withPolicy(Item item, StockState state) {
        return new StockState(state.onHand(), state.checkedOut(), state.inTransit(), state.damaged(), state.reserved(),
                equipment.available(item, null, state, 0));
    }

    public StockState physicalStock(Item item) {
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            var assets = orm.assetsForItem(item);
            return calculateAssetStock(assets);
        }
        return ledgerStock(orm.transactionTotals(item), orm.unresolvedDamageQuantity(item),
                orm.activeReservationQuantity(item), positions.blocked(item), positions.inTransit(item));
    }

    public Map<UUID, StockState> stock(List<Item> items) {
        var result = new LinkedHashMap<UUID, StockState>();
        readStock(items).forEach((id, read) -> {
            var state = read.physical();
            result.put(id, new StockState(state.onHand(), state.checkedOut(), state.inTransit(), state.damaged(), state.reserved(),
                    equipment.available(read.policy().item(), null, state, 0, read.policy())));
        });
        return result;
    }

    @jakarta.inject.Inject org.ash.inventory.orm.StockFactsOrm stockFacts;

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
        var assetsByItem = new LinkedHashMap<UUID, List<org.ash.inventory.model.AssetInstance>>();
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

    private StockState calculateAssetStock(List<org.ash.inventory.model.AssetInstance> assets) {
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

    public void assertCheckoutAllowed(Item item) {
        if (equipment.hasMemberDamage(item)) throw ApiException.conflict("Warehouse must review the open contributor damage report before checkout");
        if (MaintenancePolicy.blocksItem(item, BusinessTime.today())) {
            throw ApiException.conflict("Item " + item.name + " is blocked from checkout because maintenance status is "
                    + MaintenancePolicy.itemStatus(item, BusinessTime.today()));
        }
        assertNoBlockingScheduleIsDue(item, null);
    }

    /** Damage reported through REST or offline replay. */
    @Transactional
    public DamageReport reportDamage(ApiModels.DamageInput input) {
        actors.requireWarehouse();
        return createDamage(input);
    }

    /** Also used by return workflows that record damage on behalf of their own authorized actor. */
    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public DamageReport createDamage(ApiModels.DamageInput input) {
        var occurredAt = historicalTimestamp(input.occurredAt());
        if (input.idempotencyKey() != null) {
            var existing = orm.damageByIdempotencyKey(input.idempotencyKey());
            if (existing != null)
                return existing;
        }
        if ((input.itemId() == null) == (input.assemblyId() == null)) {
            throw ApiException.badRequest("Exactly one of itemId or assemblyId is required");
        }
        var report = new DamageReport();
        report.createdAt = occurredAt;
        if (input.itemId() != null) report.item = lockedItem(input.itemId());
        else {
            report.assembly = orm.require(Assembly.class, input.assemblyId(), "Assembly");
            if (!report.assembly.active) throw ApiException.notFound("Assembly not found");
        }
        report.reporter = actors.current();
        report.quantity = input.amount();
        report.description = input.description();
        report.severity = input.severity();
        report.safetyImpact = input.safetyImpact();
        report.idempotencyKey = input.idempotencyKey();
        if (input.orderId() != null)
            report.order = orm.require(InventoryOrder.class, input.orderId(), "Order");
        if (input.assetInstanceId() != null) {
            if (report.item == null) throw ApiException.badRequest("An asset can only be reported with its item");
            var asset = orm.findLockedAsset(input.assetInstanceId());
            if (asset == null || !asset.active || !asset.item.id.equals(report.item.id)) {
                throw ApiException.badRequest("Asset does not belong to the damaged item");
            }
            if (input.amount() != 1) throw ApiException.badRequest("Serialized asset damage quantity must be 1");
            report.assetInstance = asset;
            asset.conditionStatus = input.safetyImpact()
                    ? DomainEnums.ConditionStatus.unsafe : DomainEnums.ConditionStatus.damaged;
            // Custody, reservation and transit keep their state so their workflows can finish; the condition blocks reuse.
            asset.availabilityStatus = StockPolicy.conditionedState(asset);
        } else if (report.item != null && report.item.trackingMode == DomainEnums.TrackingMode.serialized) {
            throw ApiException.badRequest("assetInstanceId is required for serialized item damage");
        }
        if (input.handoverId() != null) {
            report.handover = orm.require(CustodyHandover.class, input.handoverId(), "Custody handover");
        }
        orm.persist(report);
        positions.reportDamage(report);
        var payload = new LinkedHashMap<String, Object>();
        if (report.item != null) payload.put("itemId", report.item.id.toString());
        if (report.assembly != null) payload.put("assemblyId", report.assembly.id.toString());
        payload.put("quantity", report.quantity);
        events.record("damage.reported", "damage_report", report.id, report.reporter.id, input.idempotencyKey(),
                payload);
        return report;
    }

    /** Damage resolution by maintenance staff; the repair lifecycle calls {@link #resolveDamage} itself. */
    @Transactional
    public DamageReport resolveDamageReport(UUID id, ApiModels.DamageResolutionInput input) {
        actors.requireWarehouse();
        return resolveDamage(id, input);
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public DamageReport resolveDamage(UUID id, ApiModels.DamageResolutionInput input) {
        var occurredAt = historicalTimestamp(input.occurredAt());
        if (input.idempotencyKey() != null) {
            actors.protect(orm.find(DamageReport.class, id), true);
            var existing = orm.transactionByIdempotencyKey(input.idempotencyKey());
            if (existing != null && existing.damageReport != null && existing.damageReport.id.equals(id))
                return existing.damageReport;
            if (existing != null)
                throw ApiException.conflict("Idempotency key is already used by another stock transaction");
        }
        if (input.status() == DomainEnums.DamageStatus.written_off) actors.requireAdmin();
        var report = orm.findLockedDamage(id);
        if (report == null)
            throw ApiException.notFound("Damage report not found");
        if (occurredAt.isBefore(report.createdAt)) throw ApiException.badRequest("Resolution date precedes damage report");
        if (input.description() != null) {
            if (input.description().isBlank()) throw ApiException.badRequest("Damage description must not be blank");
            report.description = input.description().trim();
        }
        if (input.severity() != null) report.severity = input.severity();
        if (input.itemHint() != null) {
            if (report.item == null) throw ApiException.badRequest("An item hint requires an item damage report");
            var hint = input.itemHint().trim();
            if (hint.length() > 255) throw ApiException.badRequest("Item hint must be 255 characters or less");
            report.item.hint = hint.isEmpty() ? null : hint;
        }
        if (input.status() == null) {
            events.record("damage.updated", "damage_report", report.id, actors.current().id, input.idempotencyKey(),
                    Map.of("severity", report.severity.name()));
            return report;
        }
        int resolutionAmount = input.amount() == null ? 1 : input.amount();
        var unresolved = report.quantity - report.repairedQuantity - report.writtenOffQuantity;
        if (resolutionAmount > unresolved)
            throw ApiException.badRequest("Resolution quantity exceeds unresolved damage quantity " + unresolved);
        if (input.status() != DomainEnums.DamageStatus.repaired
                && input.status() != DomainEnums.DamageStatus.written_off
                && input.status() != DomainEnums.DamageStatus.in_review) {
            throw ApiException.badRequest("Unsupported damage resolution status");
        }
        report.handler = actors.current();
        if (input.notes() != null && !input.notes().isBlank()) {
            var note = input.notes().trim();
            report.resolutionNotes = report.resolutionNotes == null || report.resolutionNotes.isBlank()
                    ? note : report.resolutionNotes + "\n" + note;
        }
        if (input.status() == DomainEnums.DamageStatus.in_review) {
            report.status = DomainEnums.DamageStatus.in_review;
            var payload = new LinkedHashMap<String, Object>();
            if (report.item != null) payload.put("itemId", report.item.id.toString());
            if (report.assembly != null) payload.put("assemblyId", report.assembly.id.toString());
            payload.put("quantity", resolutionAmount);
            events.record("damage.triaged", "damage_report", report.id, report.handler.id, input.idempotencyKey(),
                    payload);
            return report;
        }
        if (input.status() == DomainEnums.DamageStatus.repaired)
            report.repairedQuantity += resolutionAmount;
        else
            report.writtenOffQuantity += resolutionAmount;
        int remaining = report.quantity - report.repairedQuantity - report.writtenOffQuantity;
        report.status = remaining > 0 ? DomainEnums.DamageStatus.in_review
                : report.repairedQuantity == report.quantity ? DomainEnums.DamageStatus.repaired
                        : report.writtenOffQuantity == report.quantity ? DomainEnums.DamageStatus.written_off
                                : DomainEnums.DamageStatus.resolved;

        if (report.item == null) {
            events.record("damage.resolved", "damage_report", report.id, report.handler.id, input.idempotencyKey(),
                    Map.of("assemblyId", report.assembly.id.toString(), "type", input.status().name(), "quantity", resolutionAmount));
            return report;
        }

        int availabilityBefore = stock(report.item).available();
        var transaction = new StockTransaction();
        transaction.occurredAt = occurredAt;
        transaction.item = report.item;
        transaction.assetInstance = report.assetInstance;
        transaction.user = report.handler;
        transaction.type = input.status() == DomainEnums.DamageStatus.repaired ? DomainEnums.TransactionType.repaired
                : DomainEnums.TransactionType.written_off;
        transaction.quantity = resolutionAmount;
        transaction.damageReport = report;
        transaction.order = report.order;
        transaction.reason = input.status() == DomainEnums.DamageStatus.repaired ? "Damage repaired"
                : "Damage written off";
        transaction.notes = input.notes();
        transaction.idempotencyKey = input.idempotencyKey();
        transaction.clientCommandId = input.idempotencyKey();
        if (transaction.type == DomainEnums.TransactionType.written_off)
            transaction.sourceLocation = report.assetInstance == null
                    ? report.item.storageLocation : report.assetInstance.currentLocation;
        transaction.availabilityBefore = availabilityBefore;
        positions.apply(transaction);
        orm.persist(transaction);
        if (report.assetInstance != null) {
            if (transaction.type == DomainEnums.TransactionType.written_off) {
                report.assetInstance.availabilityStatus = DomainEnums.AssetState.written_off;
                report.assetInstance.active = false;
            } else {
                report.assetInstance.conditionStatus = DomainEnums.ConditionStatus.good;
                report.assetInstance.availabilityStatus = StockPolicy.conditionedState(report.assetInstance);
            }
        }
        transaction.availabilityAfter = stock(report.item).available();
        events.record("damage.resolved", "damage_report", report.id, report.handler.id, input.idempotencyKey(),
                Map.of("itemId", report.item.id.toString(), "type", transaction.type.name(), "quantity", transaction.quantity));
        return report;
    }

    /** Explicit historical dates are administrator-controlled imports; audit updates remain at server time. */
    public Instant historicalTimestamp(Instant value) {
        var now = Instant.now();
        if (value == null) return now;
        actors.requireAdmin();
        if (value.isAfter(now)) throw ApiException.badRequest("Historical date must not be in the future");
        return value;
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public MaintenanceRecord recordMaintenance(ApiModels.MaintenanceInput input) {
        actors.requireWarehouse();
        var item = lockedItem(input.itemId());
        actors.protect(item, true);
        var record = new MaintenanceRecord();
        record.item = item;
        if (input.assetInstanceId() != null) {
            var asset = orm.findLockedAsset(input.assetInstanceId());
            if (asset == null || !asset.active || !asset.item.id.equals(item.id)) {
                throw ApiException.badRequest("Asset does not belong to the maintenance item");
            }
            record.assetInstance = asset;
        } else if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            throw ApiException.badRequest("assetInstanceId is required for serialized item maintenance");
        }
        if (input.scheduleId() != null) {
            var schedule = orm.require(MaintenanceSchedule.class, input.scheduleId(), "Maintenance schedule");
            if (!schedule.item.id.equals(item.id)
                    || (schedule.assetInstance != null && (record.assetInstance == null
                            || !record.assetInstance.id.equals(schedule.assetInstance.id)))) {
                throw ApiException.badRequest("Maintenance schedule does not apply to this item or asset");
            }
            if (schedule.requiredChecklist != null && !schedule.requiredChecklist.isBlank()
                    && (input.notes() == null || input.notes().isBlank())) {
                throw ApiException.badRequest("Record the required checklist results in the maintenance notes");
            }
            record.schedule = schedule;
        }
        record.inspector = actors.current();
        record.type = input.type();
        record.performedAt = input.performedAt() == null ? Instant.now() : input.performedAt();
        record.nextDueAt = input.nextDueAt();
        record.operatingHours = input.operatingHours();
        record.result = input.result();
        record.certificateNumber = input.certificateNumber();
        record.notes = input.notes();
        advanceSchedule(record);
        orm.persist(record);
        if (input.certificateObjectKey() != null)
            record.certificateObjectKey = media.attachToMaintenance(input.certificateObjectKey(), record.id);
        boolean failed = input.result() == DomainEnums.MaintenanceResult.failed;
        var calendarDue = record.nextDueAt == null ? null : BusinessTime.date(record.nextDueAt);
        var asset = record.assetInstance;
        if (asset == null) {
            if (input.operatingHours() != null && input.operatingHours().compareTo(item.currentOperatingHours) > 0)
                runtime.record(item, null, input.operatingHours(), null, null, RuntimeEntry.Source.maintenance, "Maintenance " + record.type.name());
            item.outOfService = failed;
        } else {
            // The result belongs to this asset only; the item calendar and sibling assets are untouched.
            if (input.operatingHours() != null && input.operatingHours().compareTo(asset.operatingHours) > 0)
                runtime.record(item, asset, input.operatingHours(), null, null, RuntimeEntry.Source.maintenance, "Maintenance " + record.type.name());
            asset.outOfService = failed;
            // Only an idle warehouse asset changes physical state; custody, reservation and transit keep theirs.
            if (failed && asset.availabilityStatus == DomainEnums.AssetState.available) {
                asset.availabilityStatus = DomainEnums.AssetState.in_maintenance;
            } else if (!failed && asset.availabilityStatus == DomainEnums.AssetState.in_maintenance) {
                asset.availabilityStatus = StockPolicy.returnedState(asset);
            }
        }
        events.record("maintenance.recorded", "item", item.id, record.inspector.id, null,
                Map.of("itemId", item.id.toString(), "result", record.result.name(), "type", record.type.name()));
        return record;
    }

    private void advanceSchedule(MaintenanceRecord record) {
        var schedule = record.schedule;
        if (schedule == null || record.result == DomainEnums.MaintenanceResult.failed) return;
        switch (schedule.intervalType) {
            case date -> {
                if (record.nextDueAt == null) {
                    long days;
                    try {
                        days = schedule.intervalValue.longValueExact();
                    } catch (ArithmeticException exception) {
                        throw ApiException.badRequest("Date maintenance intervals must be whole days");
                    }
                    record.nextDueAt = record.performedAt.plus(days, java.time.temporal.ChronoUnit.DAYS);
                }
                schedule.nextDueAt = record.nextDueAt;
            }
            case operating_hours -> {
                if (record.operatingHours == null) {
                    throw ApiException.badRequest("operatingHours is required for this maintenance schedule");
                }
                schedule.nextDueValue = record.operatingHours.add(schedule.intervalValue);
            }
            case usage_count -> schedule.nextDueValue = BigDecimal.valueOf(
                    orm.checkoutCount(record.item, record.assetInstance)).add(schedule.intervalValue);
        }
    }

    private void assertNoBlockingScheduleIsDue(Item item, AssetInstance asset) {
        var now = Instant.now();
        for (var schedule : orm.blockingSchedules(item, asset)) {
            var status = maintenance.status(schedule, now);
            if (MaintenancePolicy.blocksCheckout(status)) {
                throw ApiException.conflict("Checkout is blocked by " + status + " " + schedule.maintenanceType
                        + " maintenance");
            }
        }
    }

    private Item lockedItem(UUID id) {
        var item = orm.findLockedItem(id);
        actors.protect(item, true);
        if (item == null || !item.active)
            throw ApiException.notFound("Item not found");
        return item;
    }


    private String requiredText(String value, String field) {
        if (value == null || value.isBlank())
            throw ApiException.badRequest(field + " is required");
        return value.trim();
    }

}
