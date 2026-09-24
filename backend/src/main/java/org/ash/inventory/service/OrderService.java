package org.ash.inventory.service;

import io.quarkus.cache.CacheInvalidateAll;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItemId;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderHistory;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.Notification;
import org.ash.inventory.model.OrderLineAssetAssignment;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.StockReservation;
import org.ash.inventory.model.CustodyHandover;
import org.ash.inventory.model.CustodyHandoverLine;
import org.ash.inventory.model.ReturnReconciliation;
import org.ash.inventory.model.StorageLocation;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.OrderOrm;

import java.time.LocalDate;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class OrderService {
    private final OrderOrm orm;
    private final ActorService actors;
    private final CatalogService catalog;
    private final InventoryOperationsService inventory;
    private final DomainEventService events;

    public OrderService(OrderOrm orm, ActorService actors, CatalogService catalog,
            InventoryOperationsService inventory, DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.catalog = catalog;
        this.inventory = inventory;
        this.events = events;
    }

    private static final Map<DomainEnums.OrderStatus, Set<DomainEnums.OrderStatus>> TRANSITIONS = Map.of(
            DomainEnums.OrderStatus.draft, Set.of(DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.cancelled),
            DomainEnums.OrderStatus.submitted,
            Set.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.cancelled),
            DomainEnums.OrderStatus.preparing,
            Set.of(DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.ready, DomainEnums.OrderStatus.cancelled),
            DomainEnums.OrderStatus.ready,
            Set.of(DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.picked_up,
                    DomainEnums.OrderStatus.cancelled),
            DomainEnums.OrderStatus.picked_up,
            Set.of(DomainEnums.OrderStatus.partially_returned, DomainEnums.OrderStatus.returned),
            DomainEnums.OrderStatus.partially_returned,
            Set.of(DomainEnums.OrderStatus.partially_returned, DomainEnums.OrderStatus.returned),
            DomainEnums.OrderStatus.returned, Set.of(DomainEnums.OrderStatus.closed));

    @Transactional
    public FactionOrder create(ApiModels.OrderInput input) {
        var actor = actors.current();
        if (input.idempotencyKey() != null) {
            var existing = orm.orderByHistoryIdempotencyKey(input.idempotencyKey());
            if (existing != null) {
                assertFactionAccess(actor, existing.faction);
                return existing;
            }
        }
        var event = input.eventOccurrenceId() != null
                ? required(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence")
                : catalog.findOrCreateEvent(requiredText(input.eventType(), "eventType"),
                        requiredDate(input.eventDate()));
        var faction = input.factionId() != null
                ? required(Faction.class, input.factionId(), "Faction")
                : catalog.findOrCreateFaction(event.eventType, requiredText(input.faction(), "faction"));
        assertFactionAccess(actor, faction);
        var order = new FactionOrder();
        order.eventOccurrence = event;
        order.faction = faction;
        order.requestedPickupDate = input.requestedPickupDate();
        order.collectorName = input.collectorName();
        order.notes = input.notes();
        order.createdBy = actor;
        order.orderCode = nextOrderCode(event, faction);
        orm.persist(order);
        replaceLines(order, input);
        audit(order, actor, "created", null, DomainEnums.OrderStatus.draft, input.idempotencyKey(), input.notes(), lineSnapshot(order));
        orderEvent("order.created", order, actor, input.idempotencyKey());
        return order;
    }

    @Transactional
    public FactionOrder update(UUID id, ApiModels.OrderInput input) {
        var order = lockedOrder(id);
        assertFactionAccess(actors.current(), order.faction);
        if (order.status != DomainEnums.OrderStatus.draft && order.status != DomainEnums.OrderStatus.submitted) {
            throw ApiException.conflict("Only draft or submitted orders can be edited");
        }
        var before = requestedContents(order);
        var previousEventId = order.eventOccurrence.id;
        var previousFactionId = order.faction.id;
        var event = input.eventOccurrenceId() == null
                ? order.eventOccurrence
                : required(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence");
        var faction = input.factionId() != null
                ? required(Faction.class, input.factionId(), "Faction")
                : input.faction() == null ? order.faction : catalog.findOrCreateFaction(event.eventType, input.faction());
        if (!faction.eventType.equals(event.eventType))
            throw ApiException.badRequest("Faction must belong to the selected event type");
        assertFactionAccess(actors.current(), faction);
        if (!order.faction.id.equals(faction.id)
                || !order.eventOccurrence.eventType.equals(event.eventType)
                || order.eventOccurrence.startDate.getYear() != event.startDate.getYear()) {
            order.orderCode = nextOrderCode(event, faction);
        }
        order.eventOccurrence = event;
        order.faction = faction;
        order.requestedPickupDate = input.requestedPickupDate();
        order.collectorName = input.collectorName();
        order.notes = input.notes();
        replaceLines(order, input);
        var changes = contentChanges(before, requestedContents(order));
        if (!previousEventId.equals(event.id)) changes.put("eventOccurrenceId", event.id.toString());
        if (!previousFactionId.equals(faction.id)) changes.put("factionId", faction.id.toString());
        audit(order, actors.current(), "updated", order.status, order.status, null, input.notes(), changes);
        orderEvent("order.updated", order, actors.current(), null);
        return order;
    }

    @Transactional
    public FactionOrder prepare(UUID id, ApiModels.PreparationInput input) {
        actors.requireWarehouse();
        var order = lockedOrder(id);
        if (idempotent(order, input.idempotencyKey()))
            return order;
        var lines = orm.lines(order);
        if (order.status == DomainEnums.OrderStatus.submitted)
            transition(order, DomainEnums.OrderStatus.preparing, null, "preparation_started", input.notes(), Map.of());
        else if (order.status != DomainEnums.OrderStatus.preparing)
            throw ApiException.conflict("Order must be submitted or preparing");

        releaseAssetAssignments(order);
        var requestedByItem = aggregate(lines, false);
        var assignedAssetIds = new HashSet<UUID>();
        for (var entry : requestedByItem.entrySet()) {
            var lockedItem = orm.findLocked(Item.class, entry.getKey().id);
            if (lockedItem == null) throw ApiException.notFound("Item not found");
            int prepared = input.preparedQuantities() == null ? 0
                : input.preparedQuantities().getOrDefault(entry.getKey().id, 0);
            if (prepared < 0 || prepared > entry.getValue())
                throw ApiException
                        .badRequest("Prepared quantity for " + entry.getKey().name + " is outside the requested range");
            int currentReservation = lines.stream().filter(line -> line.item.id.equals(entry.getKey().id))
                    .mapToInt(line -> line.preparedQuantity).sum();
            int availableIncludingThisOrder = inventory.stock(lockedItem).available()
                    + (lockedItem.trackingMode == DomainEnums.TrackingMode.serialized ? 0 : currentReservation);
            if (prepared > availableIncludingThisOrder && !input.acknowledgeShortages()) {
                throw ApiException.conflict("Only " + availableIncludingThisOrder + " units of " + entry.getKey().name
                        + " can be reserved");
            }
            int actualPrepared = Math.min(prepared, availableIncludingThisOrder);
            distributePrepared(lines, lockedItem, actualPrepared);
            if (lockedItem.trackingMode == DomainEnums.TrackingMode.serialized) {
                var selectedAssets = input.assetAssignments() == null ? List.<UUID>of()
                        : input.assetAssignments().getOrDefault(lockedItem.id, List.of());
                assignAssets(order, lines, lockedItem, selectedAssets, actualPrepared, assignedAssetIds);
            } else if (input.assetAssignments() != null
                    && !input.assetAssignments().getOrDefault(lockedItem.id, List.of()).isEmpty()) {
                throw ApiException.badRequest("Asset assignments can only be used with serialized items");
            }
        }
        reconcileReservations(order, lines, actors.current());
        order.preparedBy = actors.current();
        audit(order, actors.current(), "preparation_saved", order.status, order.status, input.idempotencyKey(),
                input.notes(), lineSnapshot(order));
        orderEvent("order.prepared", order, actors.current(), input.idempotencyKey());
        return order;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "events-cache")
    public FactionOrder transition(UUID id, DomainEnums.OrderStatus target, ApiModels.TransitionInput input) {
        var order = lockedOrder(id);
        var actor = actors.current();
        if (idempotent(order, input.idempotencyKey()))
            return order;
        if (target == DomainEnums.OrderStatus.submitted || target == DomainEnums.OrderStatus.draft)
            assertFactionAccess(actor, order.faction);
        else if (target == DomainEnums.OrderStatus.picked_up || target == DomainEnums.OrderStatus.closed)
            actors.requireMarshal();
        else if (target == DomainEnums.OrderStatus.ready || target == DomainEnums.OrderStatus.preparing)
            actors.requireWarehouse();
        else
            actors.requirePlanner();
        if (target == DomainEnums.OrderStatus.ready) {
            var lines = orm.lines(order);
            boolean nonePrepared = lines.stream().allMatch(line -> line.preparedQuantity == 0);
            if (nonePrepared)
                throw ApiException.conflict("An order cannot be ready before any items are prepared");
            order.pickupLocation = input.pickupLocation() == null ? order.pickupLocation
                    : required(StorageLocation.class, input.pickupLocation(), "Pickup location");
            applyPickupPoint(order, input.pickupLatitude(), input.pickupLongitude());
            order.readyBy = actor;
        }
        if (target == DomainEnums.OrderStatus.picked_up) {
            order.collectorName = input.collectorName() == null ? order.collectorName : input.collectorName();
            pickup(order, actor, input.idempotencyKey());
            order.pickedUpBy = actor;
        }
        if (target == DomainEnums.OrderStatus.cancelled)
            releaseReservations(order);
        if (order.status == DomainEnums.OrderStatus.preparing && target == DomainEnums.OrderStatus.submitted) {
            releaseReservations(order);
            clearPreparation(order);
        }
        if (target == DomainEnums.OrderStatus.closed && hasOutstanding(order))
            throw ApiException.conflict("Order still has outstanding units");
        transition(order, target, input.idempotencyKey(), actionFor(target), input.notes(), lineSnapshot(order));
        if (target == DomainEnums.OrderStatus.ready)
            createReadyNotification(order);
        return order;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "events-cache")
    public FactionOrder returnItems(UUID id, ApiModels.ReturnInput input) {
        actors.requireMarshal();
        var order = lockedOrder(id);
        if (idempotent(order, input.idempotencyKey()))
            return order;
        if (order.status != DomainEnums.OrderStatus.picked_up
                && order.status != DomainEnums.OrderStatus.partially_returned) {
            throw ApiException.conflict("Order must be picked up before returns can be recorded");
        }
        var actor = actors.current();
        var lines = orm.lines(order);
        var handoverDetails = new ArrayList<ReturnHandoverDetail>();
        var assetOutcomes = input.assets() == null ? Map.<UUID, ApiModels.AssetReturnLine>of() : input.assets();
        var assignmentsByAsset = new LinkedHashMap<UUID, OrderLineAssetAssignment>();
        for (var assignment : orm.assetAssignments(order)) assignmentsByAsset.put(assignment.assetInstance.id, assignment);
        for (var assetId : assetOutcomes.keySet()) {
            var assignment = assignmentsByAsset.get(assetId);
            if (assignment == null) throw ApiException.badRequest("Asset is not assigned to this order: " + assetId);
            if (!input.lines().containsKey(assignment.assetInstance.item.id)) {
                throw ApiException.badRequest("Asset outcome has no matching item return line: " + assetId);
            }
        }
        for (var entry : input.lines().entrySet()) {
            var item = orm.findLocked(Item.class, entry.getKey());
            if (item == null)
                throw ApiException.notFound("Item not found");
            var relevant = lines.stream().filter(line -> line.item.id.equals(item.id)).toList();
            int outstanding = relevant.stream().mapToInt(this::outstandingQuantity).sum();
            var outcome = entry.getValue();
            if (!item.consumable && outcome.consumed() > 0)
                throw ApiException.badRequest("Only consumable items can be recorded as consumed");
            int reconciled = outcome.returned() + outcome.consumed() + outcome.damaged();
            if (reconciled + outcome.missing() > outstanding)
                throw ApiException.badRequest("Return quantities exceed outstanding quantity for " + item.name);
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                applySerializedAssetOutcomes(item, order, actor, outcome, input.idempotencyKey(), assetOutcomes,
                        assignmentsByAsset, handoverDetails);
            } else {
                distributeReturn(order, relevant, item, actor, outcome.returned(), outcome.consumed(),
                        outcome.damaged(), outcome.missing(), input.idempotencyKey(), outcome.notes(), handoverDetails);
                if (outcome.returned() > 0)
                    createReturnTransaction(item, order, actor, DomainEnums.TransactionType.checkin,
                            outcome.returned(), input.idempotencyKey(), "returned", outcome.notes());
                if (outcome.consumed() > 0)
                    createReturnTransaction(item, order, actor, DomainEnums.TransactionType.consumed,
                            outcome.consumed(), input.idempotencyKey(), "consumed", outcome.notes());
                if (outcome.damaged() > 0)
                    createReturnTransaction(item, order, actor, DomainEnums.TransactionType.checkin,
                            outcome.damaged(), input.idempotencyKey(), "damaged", "Returned damaged: " + outcome.notes());
            }
            if (item.trackingMode != DomainEnums.TrackingMode.serialized && outcome.damaged() > 0) {
                var damage = new DamageReport();
                damage.item = item;
                damage.reporter = actor;
                damage.factionOrder = order;
                damage.quantity = outcome.damaged();
                damage.severity = DomainEnums.DamageSeverity.high;
                damage.description = outcome.notes() == null ? "Damage recorded during order return" : outcome.notes();
                orm.persist(damage);
            }
            if (outcome.operatingHours() != null
                    && outcome.operatingHours().compareTo(item.currentOperatingHours) >= 0) {
                item.currentOperatingHours = outcome.operatingHours();
            }
        }
        createReturnHandover(order, actor, input.idempotencyKey(), input, handoverDetails);
        order.returnedBy = actor;
        var target = hasOutstanding(order) ? DomainEnums.OrderStatus.partially_returned
                : DomainEnums.OrderStatus.returned;
        transition(order, target, input.idempotencyKey(),
                target == DomainEnums.OrderStatus.returned ? "returned" : "partially_returned", input.notes(),
                lineSnapshot(order));
        return order;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "events-cache")
    public FactionOrder returnAll(UUID id, UUID idempotencyKey) {
        var order = lockedOrder(id);
        var lines = orm.lines(order);
        var outcomes = new LinkedHashMap<UUID, ApiModels.ReturnLine>();
        var assetOutcomes = new LinkedHashMap<UUID, ApiModels.AssetReturnLine>();
        for (var entry : aggregateOutstanding(lines).entrySet())
            outcomes.put(entry.getKey().id,
                    new ApiModels.ReturnLine(entry.getValue(), 0, 0, 0, null, "Full order return"));
        for (var assignment : orm.assetAssignments(order)) {
            var asset = assignment.assetInstance;
            if (asset.availabilityStatus == DomainEnums.AssetState.in_field
                    || asset.availabilityStatus == DomainEnums.AssetState.in_custody
                    || asset.availabilityStatus == DomainEnums.AssetState.lost) {
                assetOutcomes.put(asset.id, new ApiModels.AssetReturnLine(
                        DomainEnums.ReconciliationOutcome.returned_good, null, "Full order return"));
            }
        }
        return returnItems(id, new ApiModels.ReturnInput(outcomes, assetOutcomes, idempotencyKey, "Full order return"));
    }

    public void assertCanView(FactionOrder order) {
        assertFactionAccess(actors.current(), order.faction);
    }

    private void pickup(FactionOrder order, UserAccount actor, UUID idempotencyKey) {
        var lines = orm.lines(order);
        for (var entry : aggregatePrepared(lines).entrySet()) {
            var item = orm.findLocked(Item.class, entry.getKey().id);
            inventory.assertCheckoutAllowed(item);
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                pickupAssignedAssets(order, item, actor, idempotencyKey, entry.getValue());
                continue;
            }
            int ownReservation = lines.stream().filter(line -> line.item.id.equals(item.id))
                    .mapToInt(line -> line.preparedQuantity).sum();
            int available = inventory.stock(item).available() + ownReservation;
            if (entry.getValue() > available)
                throw ApiException.conflict("Insufficient stock to pick up " + item.name);
            var transaction = new StockTransaction();
            transaction.item = item;
            transaction.user = actor;
            transaction.factionOrder = order;
            transaction.eventType = order.eventOccurrence.eventType;
            transaction.faction = order.faction.name;
            transaction.type = DomainEnums.TransactionType.checkout;
            transaction.quantity = entry.getValue();
            transaction.availabilityBefore = available;
            transaction.availabilityAfter = available - entry.getValue();
            transaction.reason = "Faction order pickup " + order.orderCode;
            transaction.idempotencyKey = transactionKey(idempotencyKey, order, item, "pickup");
            transaction.clientCommandId = idempotencyKey;
            transaction.sourceLocation = item.storageLocation;
            transaction.destinationLocation = order.pickupLocation;
            orm.persist(transaction);
        }
        for (var line : lines)
            line.handedOverQuantity = line.preparedQuantity;
        convertReservationsToCustody(order);
        createHandover(order, actor, idempotencyKey, lines);
    }

    private void replaceLines(FactionOrder order, ApiModels.OrderInput input) {
        orm.deleteLines(order);
        int count = 0;
        if (input.requestedQuantities() != null) {
            for (var entry : input.requestedQuantities().entrySet()) {
                if (entry.getValue() == null || entry.getValue() < 1)
                    continue;
                addLine(order, required(Item.class, entry.getKey(), "Item"), null, entry.getValue());
                count++;
            }
        }
        if (input.requestedAssemblyQuantities() != null) {
            for (var entry : input.requestedAssemblyQuantities().entrySet()) {
                if (entry.getValue() == null || entry.getValue() < 1)
                    continue;
                var assembly = required(Assembly.class, entry.getKey(), "Assembly");
                for (var component : orm.assemblyItems(assembly)) {
                    addLine(order, component.item, assembly, component.quantity * entry.getValue());
                    count++;
                }
            }
        }
        if (count == 0)
            throw ApiException.badRequest("Add at least one item or assembly to the order");
    }

    private void addLine(FactionOrder order, Item item, Assembly assembly, int quantity) {
        var line = new FactionOrderLine();
        line.order = order;
        line.item = item;
        line.sourceAssembly = assembly;
        line.requestedQuantity = quantity;
        orm.persist(line);
    }

    private void distributePrepared(List<FactionOrderLine> lines, Item item, int quantity) {
        int remaining = quantity;
        for (var line : lines.stream().filter(candidate -> candidate.item.id.equals(item.id)).toList()) {
            line.preparedQuantity = Math.min(line.requestedQuantity, remaining);
            line.allocatedQuantity = line.preparedQuantity;
            line.reservedQuantity = line.preparedQuantity;
            remaining -= line.preparedQuantity;
        }
    }

    private void assignAssets(FactionOrder order, List<FactionOrderLine> lines, Item item, List<UUID> assetIds,
            int preparedQuantity, Set<UUID> assignedAssetIds) {
        if (assetIds.size() != preparedQuantity)
            throw ApiException.badRequest("Select exactly " + preparedQuantity + " serialized assets for " + item.name);

        var preparedLines = lines.stream()
                .filter(line -> line.item.id.equals(item.id) && line.preparedQuantity > 0).toList();
        int lineIndex = 0;
        int assignedToLine = 0;
        for (UUID assetId : assetIds) {
            if (!assignedAssetIds.add(assetId))
                throw ApiException.badRequest("A serialized asset can only be assigned once");
            AssetInstance asset = orm.findLocked(AssetInstance.class, assetId);
            if (asset == null || !asset.active || !asset.item.id.equals(item.id))
                throw ApiException.notFound("Asset instance not found for " + item.name);
            if (asset.availabilityStatus != DomainEnums.AssetState.available)
                throw ApiException.conflict("Asset " + asset.assetCode + " is not available");
            assertAssetCanBePacked(asset);

            while (lineIndex < preparedLines.size()
                    && assignedToLine >= preparedLines.get(lineIndex).preparedQuantity) {
                lineIndex++;
                assignedToLine = 0;
            }
            if (lineIndex >= preparedLines.size())
                throw ApiException.badRequest("Too many serialized assets selected for " + item.name);

            var assignment = new OrderLineAssetAssignment();
            assignment.order = order;
            assignment.orderLine = preparedLines.get(lineIndex);
            assignment.assetInstance = asset;
            orm.persist(assignment);
            asset.availabilityStatus = DomainEnums.AssetState.staged;
            asset.currentLocation = item.storageLocation;
            asset.currentCustodian = null;
            assignedToLine++;
        }
    }

    private void assertAssetCanBePacked(AssetInstance asset) {
        if (asset.conditionStatus == DomainEnums.ConditionStatus.damaged
                || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe
                || asset.conditionStatus == DomainEnums.ConditionStatus.lost) {
            throw ApiException.conflict("Asset " + asset.assetCode + " cannot be packed because its condition is "
                    + asset.conditionStatus);
        }
        if (asset.serviceStatus == DomainEnums.MaintenanceStatus.overdue
                || asset.serviceStatus == DomainEnums.MaintenanceStatus.in_service) {
            throw ApiException.conflict("Asset " + asset.assetCode + " cannot be packed because its service status is "
                    + asset.serviceStatus);
        }
    }

    private void pickupAssignedAssets(FactionOrder order, Item item, UserAccount actor, UUID idempotencyKey,
            int preparedQuantity) {
        var assignments = orm.assetAssignments(order, item);
        if (assignments.size() != preparedQuantity)
            throw ApiException.conflict("Serialized asset assignments for " + item.name + " are incomplete");
        for (var assignment : assignments) {
            var asset = orm.findLocked(AssetInstance.class, assignment.assetInstance.id);
            if (asset.availabilityStatus != DomainEnums.AssetState.staged)
                throw ApiException.conflict("Asset " + asset.assetCode + " is no longer staged for this order");
            assertAssetCanBePacked(asset);
            int before = inventory.stock(item).available();
            var transaction = new StockTransaction();
            transaction.item = item;
            transaction.assetInstance = asset;
            transaction.user = actor;
            transaction.factionOrder = order;
            transaction.eventType = order.eventOccurrence.eventType;
            transaction.faction = order.faction.name;
            transaction.type = DomainEnums.TransactionType.checkout;
            transaction.quantity = 1;
            transaction.availabilityBefore = before;
            transaction.reason = "Faction order pickup " + order.orderCode;
            transaction.idempotencyKey = transactionKey(idempotencyKey, order, item, "pickup:" + asset.id);
            transaction.clientCommandId = idempotencyKey;
            transaction.sourceLocation = asset.currentLocation == null ? item.storageLocation : asset.currentLocation;
            transaction.destinationLocation = order.pickupLocation;
            asset.availabilityStatus = DomainEnums.AssetState.in_field;
            asset.currentLocation = order.pickupLocation;
            asset.currentCustodian = null;
            orm.persist(transaction);
            transaction.availabilityAfter = inventory.stock(item).available();
        }
    }

    private void distributeReturn(FactionOrder order, List<FactionOrderLine> lines, Item item, UserAccount actor,
            int returned, int consumed, int damaged, int missing, UUID idempotencyKey, String notes,
            List<ReturnHandoverDetail> handoverDetails) {
        int undistributed = distributeOutcome(order, lines, item, actor, returned,
                DomainEnums.ReconciliationOutcome.returned_good, idempotencyKey, notes, handoverDetails);
        undistributed += distributeOutcome(order, lines, item, actor, consumed,
                DomainEnums.ReconciliationOutcome.consumed, idempotencyKey, notes, handoverDetails);
        undistributed += distributeOutcome(order, lines, item, actor, damaged,
                DomainEnums.ReconciliationOutcome.returned_damaged, idempotencyKey, notes, handoverDetails);
        if (undistributed > 0)
            throw ApiException.badRequest("Return quantities exceed outstanding quantity for " + item.name);

        int currentMissing = lines.stream().mapToInt(line -> line.missingQuantity).sum();
        if (missing < currentMissing) {
            throw ApiException.badRequest("Missing quantity is the current unresolved total and cannot be reduced without an outcome");
        }
        int missingLeft = missing - currentMissing;
        for (var line : lines) {
            int capacity = Math.max(0, outstandingQuantity(line) - line.missingQuantity);
            int newlyMissing = Math.min(capacity, missingLeft);
            line.missingQuantity += newlyMissing;
            recordReconciliation(order, line, item, actor, DomainEnums.ReconciliationOutcome.missing,
                    newlyMissing, idempotencyKey, notes);
            missingLeft -= newlyMissing;
        }
        if (missingLeft > 0)
            throw ApiException.badRequest("Missing quantity exceeds outstanding quantity for " + item.name);
    }

    private int distributeOutcome(FactionOrder order, List<FactionOrderLine> lines, Item item, UserAccount actor,
            int quantity, DomainEnums.ReconciliationOutcome outcome, UUID idempotencyKey, String notes,
            List<ReturnHandoverDetail> handoverDetails) {
        int remaining = distributeOutcomePass(order, lines, item, actor, quantity, outcome, false,
                idempotencyKey, notes, handoverDetails);
        return distributeOutcomePass(order, lines, item, actor, remaining, outcome, true, idempotencyKey, notes,
                handoverDetails);
    }

    private int distributeOutcomePass(FactionOrder order, List<FactionOrderLine> lines, Item item, UserAccount actor,
            int quantity, DomainEnums.ReconciliationOutcome outcome, boolean resolveMissing,
            UUID idempotencyKey, String notes, List<ReturnHandoverDetail> handoverDetails) {
        int remaining = quantity;
        for (var line : lines) {
            int capacity = resolveMissing
                    ? Math.min(outstandingQuantity(line), line.missingQuantity)
                    : Math.max(0, outstandingQuantity(line) - line.missingQuantity);
            int take = Math.min(capacity, remaining);
            if (take == 0) continue;
            switch (outcome) {
                case returned_good -> line.returnedQuantity += take;
                case consumed -> line.consumedQuantity += take;
                case returned_damaged -> line.damagedQuantity += take;
                default -> throw new IllegalArgumentException("Unsupported reconciliation outcome " + outcome);
            }
            if (resolveMissing) line.missingQuantity -= take;
            var recordedOutcome = resolveMissing && outcome == DomainEnums.ReconciliationOutcome.returned_good
                    ? DomainEnums.ReconciliationOutcome.returned_late : outcome;
            recordReconciliation(order, line, item, actor, recordedOutcome, take, idempotencyKey, notes);
            if (outcome == DomainEnums.ReconciliationOutcome.returned_good
                    || outcome == DomainEnums.ReconciliationOutcome.returned_damaged) {
                handoverDetails.add(new ReturnHandoverDetail(line, null, take, notes));
            }
            remaining -= take;
            if (remaining == 0) break;
        }
        return remaining;
    }

    private void reconcileReservations(FactionOrder order, List<FactionOrderLine> lines, UserAccount actor) {
        for (var line : lines) {
            var reservation = orm.reservation(line);
            if (line.preparedQuantity == 0) {
                if (reservation != null && reservation.openQuantity() > 0) release(reservation);
                line.reservedQuantity = 0;
                continue;
            }
            if (reservation == null) {
                reservation = new StockReservation();
                reservation.order = order;
                reservation.orderLine = line;
                reservation.item = line.item;
                reservation.location = line.item.storageLocation;
                reservation.createdBy = actor;
                orm.persist(reservation);
            }
            reservation.requestedQuantity = line.requestedQuantity;
            reservation.reservedQuantity = line.preparedQuantity;
            reservation.releasedQuantity = 0;
            reservation.releasedAt = null;
            reservation.status = DomainEnums.ReservationStatus.active;
            reservation.activeAssetKey = "ACTIVE";
            line.reservedQuantity = line.preparedQuantity;
        }
    }

    private void releaseReservations(FactionOrder order) {
        releaseAssetAssignments(order);
        for (var reservation : orm.reservations(order)) {
            if (reservation.openQuantity() > 0) release(reservation);
            reservation.activeAssetKey = null;
        }
        for (var line : orm.lines(order)) line.reservedQuantity = 0;
    }

    private void releaseAssetAssignments(FactionOrder order) {
        for (var assignment : orm.assetAssignments(order)) {
            var asset = assignment.assetInstance;
            if (asset.availabilityStatus == DomainEnums.AssetState.staged
                    || asset.availabilityStatus == DomainEnums.AssetState.reserved) {
                asset.availabilityStatus = DomainEnums.AssetState.available;
                asset.currentLocation = asset.item.storageLocation;
                asset.currentCustodian = null;
            }
        }
        orm.removeAssetAssignments(order);
    }

    private void clearPreparation(FactionOrder order) {
        for (var line : orm.lines(order)) {
            line.preparedQuantity = 0;
            line.allocatedQuantity = 0;
            line.reservedQuantity = 0;
        }
    }

    private void release(StockReservation reservation) {
        reservation.releasedQuantity = reservation.reservedQuantity;
        reservation.releasedAt = Instant.now();
        reservation.status = DomainEnums.ReservationStatus.released;
        reservation.activeAssetKey = null;
    }

    private void convertReservationsToCustody(FactionOrder order) {
        for (var reservation : orm.reservations(order)) {
            if (reservation.openQuantity() == 0) continue;
            reservation.releasedQuantity = reservation.reservedQuantity;
            reservation.releasedAt = Instant.now();
            reservation.status = DomainEnums.ReservationStatus.converted_to_custody;
            reservation.activeAssetKey = null;
        }
        for (var line : orm.lines(order)) line.reservedQuantity = 0;
    }

    private void createHandover(FactionOrder order, UserAccount actor, UUID idempotencyKey,
            List<FactionOrderLine> lines) {
        var handover = new CustodyHandover();
        handover.order = order;
        handover.type = DomainEnums.HandoverType.checkout;
        handover.marshal = actor;
        handover.collectorName = order.collectorName == null || order.collectorName.isBlank()
                ? order.faction.name : order.collectorName;
        handover.location = order.pickupLocation;
        handover.conditionConfirmed = true;
        handover.handoverCode = order.orderCode + "-OUT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
        handover.idempotencyKey = idempotencyKey;
        orm.persist(handover);
        var assignmentsByLine = new LinkedHashMap<UUID, List<OrderLineAssetAssignment>>();
        for (var assignment : orm.assetAssignments(order)) {
            assignmentsByLine.computeIfAbsent(assignment.orderLine.id, ignored -> new ArrayList<>()).add(assignment);
        }
        for (var line : lines) {
            if (line.handedOverQuantity == 0) continue;
            if (line.item.trackingMode == DomainEnums.TrackingMode.serialized) {
                for (var assignment : assignmentsByLine.getOrDefault(line.id, List.of())) {
                    var detail = new CustodyHandoverLine();
                    detail.handover = handover;
                    detail.orderLine = line;
                    detail.item = line.item;
                    detail.assetInstance = assignment.assetInstance;
                    detail.quantity = 1;
                    orm.persist(detail);
                }
                continue;
            }
            var detail = new CustodyHandoverLine();
            detail.handover = handover;
            detail.orderLine = line;
            detail.item = line.item;
            detail.quantity = line.handedOverQuantity;
            orm.persist(detail);
        }
    }

    private void createReturnHandover(FactionOrder order, UserAccount actor, UUID idempotencyKey,
            ApiModels.ReturnInput input, List<ReturnHandoverDetail> details) {
        var handover = new CustodyHandover();
        handover.order = order;
        handover.type = DomainEnums.HandoverType.checkin;
        handover.marshal = actor;
        handover.collectorName = order.collectorName == null || order.collectorName.isBlank()
                ? order.faction.name : order.collectorName;
        handover.location = order.pickupLocation;
        handover.conditionConfirmed = true;
        handover.handoverCode = order.orderCode + "-IN-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
        handover.idempotencyKey = idempotencyKey;
        handover.notes = input.notes();
        orm.persist(handover);
        for (var returned : details) {
            var detail = new CustodyHandoverLine();
            detail.handover = handover;
            detail.orderLine = returned.line();
            detail.item = returned.line().item;
            detail.assetInstance = returned.asset();
            detail.quantity = returned.quantity();
            detail.conditionNotes = returned.notes();
            orm.persist(detail);
        }
    }

    private void recordReconciliation(FactionOrder order, FactionOrderLine line, Item item, UserAccount actor,
            DomainEnums.ReconciliationOutcome outcome, int quantity, UUID idempotencyKey, String notes) {
        recordReconciliation(order, line, item, null, actor, outcome, quantity, idempotencyKey, notes);
    }

    private void recordReconciliation(FactionOrder order, FactionOrderLine line, Item item, AssetInstance asset,
            UserAccount actor, DomainEnums.ReconciliationOutcome outcome, int quantity, UUID idempotencyKey, String notes) {
        if (quantity <= 0) return;
        var reconciliation = new ReturnReconciliation();
        reconciliation.order = order;
        reconciliation.orderLine = line;
        reconciliation.item = item;
        reconciliation.assetInstance = asset;
        reconciliation.recordedBy = actor;
        reconciliation.outcome = outcome;
        reconciliation.quantity = quantity;
        reconciliation.idempotencyKey = idempotencyKey;
        reconciliation.notes = notes;
        orm.persist(reconciliation);
    }

    private StockTransaction createReturnTransaction(Item item, FactionOrder order, UserAccount actor,
            DomainEnums.TransactionType type,
            int quantity, UUID clientCommandId, String operation, String notes) {
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.user = actor;
        transaction.factionOrder = order;
        transaction.eventType = order.eventOccurrence.eventType;
        transaction.faction = order.faction.name;
        transaction.type = type;
        transaction.quantity = quantity;
        transaction.reason = "Faction order return " + order.orderCode;
        transaction.notes = notes;
        transaction.idempotencyKey = transactionKey(clientCommandId, order, item, operation);
        transaction.clientCommandId = clientCommandId;
        transaction.sourceLocation = order.pickupLocation;
        if (type == DomainEnums.TransactionType.checkin)
            transaction.destinationLocation = item.storageLocation;
        transaction.availabilityBefore = inventory.stock(item).available();
        orm.persist(transaction);
        transaction.availabilityAfter = inventory.stock(item).available();
        return transaction;
    }

    private void applySerializedAssetOutcomes(Item item, FactionOrder order, UserAccount actor,
            ApiModels.ReturnLine summary, UUID clientCommandId, Map<UUID, ApiModels.AssetReturnLine> outcomes,
            Map<UUID, OrderLineAssetAssignment> assignmentsByAsset, List<ReturnHandoverDetail> handoverDetails) {
        if (summary.consumed() > 0) throw ApiException.badRequest("Serialized assets cannot be consumed");
        int returned = 0;
        int damaged = 0;
        for (var entry : outcomes.entrySet()) {
            var assignment = assignmentsByAsset.get(entry.getKey());
            if (assignment == null || !assignment.assetInstance.item.id.equals(item.id)) continue;
            var asset = orm.findLocked(AssetInstance.class, entry.getKey());
            boolean wasMissing = asset.availabilityStatus == DomainEnums.AssetState.lost;
            if (!wasMissing && asset.availabilityStatus != DomainEnums.AssetState.in_field
                    && asset.availabilityStatus != DomainEnums.AssetState.in_custody
                    && asset.availabilityStatus != DomainEnums.AssetState.returned_pending_check) {
                throw ApiException.conflict("Asset " + asset.assetCode + " is not outstanding on this order");
            }
            var line = assignment.orderLine;
            var assetOutcome = entry.getValue();
            String notes = assetOutcome.notes() == null ? summary.notes() : assetOutcome.notes();
            switch (assetOutcome.outcome()) {
                case returned_good -> {
                    if (wasMissing) line.missingQuantity--;
                    line.returnedQuantity++;
                    if (asset.conditionStatus == DomainEnums.ConditionStatus.lost) asset.conditionStatus = DomainEnums.ConditionStatus.fair;
                    recordReconciliation(order, line, item, asset, actor,
                            wasMissing ? DomainEnums.ReconciliationOutcome.returned_late
                                    : DomainEnums.ReconciliationOutcome.returned_good,
                            1, clientCommandId, notes);
                    createSerializedReturnTransaction(item, order, actor, asset, DomainEnums.TransactionType.checkin,
                            DomainEnums.AssetState.available, clientCommandId, "returned", notes);
                    handoverDetails.add(new ReturnHandoverDetail(line, asset, 1, notes));
                    returned++;
                }
                case returned_damaged -> {
                    if (wasMissing) line.missingQuantity--;
                    line.damagedQuantity++;
                    asset.conditionStatus = DomainEnums.ConditionStatus.damaged;
                    recordReconciliation(order, line, item, asset, actor,
                            DomainEnums.ReconciliationOutcome.returned_damaged, 1, clientCommandId, notes);
                    createSerializedReturnTransaction(item, order, actor, asset, DomainEnums.TransactionType.checkin,
                            DomainEnums.AssetState.damaged, clientCommandId, "damaged", notes);
                    var damage = new DamageReport();
                    damage.item = item;
                    damage.assetInstance = asset;
                    damage.reporter = actor;
                    damage.factionOrder = order;
                    damage.quantity = 1;
                    damage.severity = DomainEnums.DamageSeverity.high;
                    damage.description = notes == null ? "Damage recorded during order return" : notes;
                    orm.persist(damage);
                    handoverDetails.add(new ReturnHandoverDetail(line, asset, 1, notes));
                    damaged++;
                }
                case missing -> {
                    if (wasMissing) throw ApiException.badRequest("Asset " + asset.assetCode + " is already missing");
                    line.missingQuantity++;
                    asset.conditionStatus = DomainEnums.ConditionStatus.lost;
                    recordReconciliation(order, line, item, asset, actor,
                            DomainEnums.ReconciliationOutcome.missing, 1, clientCommandId, notes);
                    createSerializedReturnTransaction(item, order, actor, asset, DomainEnums.TransactionType.missing,
                            DomainEnums.AssetState.lost, clientCommandId, "missing", notes);
                }
                default -> throw ApiException.badRequest("Unsupported serialized asset return outcome " + assetOutcome.outcome());
            }
            if (assetOutcome.operatingHours() != null) asset.operatingHours = assetOutcome.operatingHours();
        }
        int remainingMissing = assignmentsByAsset.values().stream()
                .filter(assignment -> assignment.assetInstance.item.id.equals(item.id))
                .map(assignment -> assignment.assetInstance)
                .map(asset -> orm.findLocked(AssetInstance.class, asset.id))
                .mapToInt(asset -> asset.availabilityStatus == DomainEnums.AssetState.lost ? 1 : 0)
                .sum();
        if (returned != summary.returned() || damaged != summary.damaged() || remainingMissing != summary.missing()) {
            throw ApiException.badRequest("Serialized return quantities must match the submitted per-asset outcomes for " + item.name);
        }
    }

    private record ReturnHandoverDetail(FactionOrderLine line, AssetInstance asset, int quantity, String notes) {}

    private void createSerializedReturnTransaction(Item item, FactionOrder order, UserAccount actor,
            AssetInstance asset, DomainEnums.TransactionType type, DomainEnums.AssetState targetState,
            UUID clientCommandId, String operation, String notes) {
        int before = inventory.stock(item).available();
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.assetInstance = asset;
        transaction.user = actor;
        transaction.factionOrder = order;
        transaction.eventType = order.eventOccurrence.eventType;
        transaction.faction = order.faction.name;
        transaction.type = type;
        transaction.quantity = 1;
        transaction.reason = "Faction order return " + order.orderCode;
        transaction.notes = notes;
        transaction.idempotencyKey = transactionKey(clientCommandId, order, item, operation + ":" + asset.id);
        transaction.clientCommandId = clientCommandId;
        transaction.sourceLocation = asset.currentLocation == null ? order.pickupLocation : asset.currentLocation;
        asset.availabilityStatus = targetState;
        asset.currentLocation = targetState == DomainEnums.AssetState.available
                || targetState == DomainEnums.AssetState.damaged ? item.storageLocation : null;
        asset.currentCustodian = null;
        if (type == DomainEnums.TransactionType.checkin)
            transaction.destinationLocation = item.storageLocation;
        transaction.availabilityBefore = before;
        orm.persist(transaction);
        transaction.availabilityAfter = inventory.stock(item).available();
    }

    private UUID transactionKey(UUID clientCommandId, FactionOrder order, Item item, String operation) {
        if (clientCommandId == null) return null;
        return UUID.nameUUIDFromBytes((clientCommandId + ":" + order.id + ":" + item.id + ":" + operation)
                .getBytes(StandardCharsets.UTF_8));
    }

    private void transition(FactionOrder order, DomainEnums.OrderStatus target, UUID idempotencyKey, String action,
            String notes, Map<String, Object> delta) {
        var from = order.status;
        if (!TRANSITIONS.getOrDefault(from, Set.of()).contains(target))
            throw ApiException.conflict("Invalid order transition: " + from + " -> " + target);
        order.status = target;
        audit(order, actors.current(), action, from, target, idempotencyKey, notes, delta);
        orderEvent("order." + target.name(), order, actors.current(), idempotencyKey);
    }

    private void audit(FactionOrder order, UserAccount actor, String action, DomainEnums.OrderStatus from,
            DomainEnums.OrderStatus to, UUID idempotencyKey, String notes, Map<String, Object> delta) {
        var history = new FactionOrderHistory();
        history.order = order;
        history.actor = actor;
        history.action = action;
        history.fromStatus = from == null ? null : from.name();
        history.toStatus = to == null ? null : to.name();
        history.idempotencyKey = idempotencyKey;
        history.notes = notes;
        history.deltaSnapshot = delta;
        orm.persist(history);
    }

    private boolean idempotent(FactionOrder order, UUID key) {
        return key != null && orm.historyExists(order, key);
    }

    private boolean hasOutstanding(FactionOrder order) {
        return orm.lines(order).stream()
                .anyMatch(line -> outstandingQuantity(line) > 0);
    }

    private Map<Item, Integer> aggregate(List<FactionOrderLine> lines, boolean prepared) {
        var values = new LinkedHashMap<Item, Integer>();
        for (var line : lines)
            values.merge(line.item, prepared ? line.preparedQuantity : line.requestedQuantity, Integer::sum);
        return values;
    }

    private Map<Item, Integer> aggregatePrepared(List<FactionOrderLine> lines) {
        return aggregate(lines, true);
    }

    private Map<Item, Integer> aggregateOutstanding(List<FactionOrderLine> lines) {
        var values = new LinkedHashMap<Item, Integer>();
        for (var line : lines)
            values.merge(line.item, outstandingQuantity(line), Integer::sum);
        return values;
    }

    private int outstandingQuantity(FactionOrderLine line) {
        return Math.max(0, line.handedOverQuantity - line.returnedQuantity - line.consumedQuantity
                - line.damagedQuantity - line.writtenOffQuantity);
    }

    private Map<String, Object> lineSnapshot(FactionOrder order) {
        var rows = new ArrayList<Map<String, Object>>();
        for (var line : orm.lines(order)) {
            var row = new LinkedHashMap<String, Object>();
            row.put("itemId", line.item.id);
            if (line.sourceAssembly != null) row.put("sourceAssemblyId", line.sourceAssembly.id);
            row.put("requested", line.requestedQuantity);
            row.put("prepared", line.preparedQuantity);
            row.put("handedOver", line.handedOverQuantity);
            row.put("returned", line.returnedQuantity);
            row.put("missing", line.missingQuantity);
            row.put("damaged", line.damagedQuantity);
            rows.add(row);
        }
        var contents = requestedContents(order);
        return Map.of("lines", rows, "items", contents.items(), "assemblies", contents.assemblies());
    }

    private RequestedContents requestedContents(FactionOrder order) {
        var lines = orm.lines(order);
        var assemblyIds = lines.stream().filter(line -> line.sourceAssembly != null)
                .map(line -> line.sourceAssembly.id).distinct().toList();
        var components = new LinkedHashMap<AssemblyItemId, Integer>();
        for (var component : orm.assemblyItems(assemblyIds)) components.put(component.id, component.quantity);
        var quantities = OrderQuantities.from(lines, components);
        return new RequestedContents(quantities.requested(), quantities.requestedAssemblies());
    }

    private Map<String, Object> contentChanges(RequestedContents before, RequestedContents after) {
        var result = new LinkedHashMap<String, Object>();
        result.put("items", after.items());
        result.put("assemblies", after.assemblies());
        result.put("addedItems", addedValues(before.items(), after.items()));
        result.put("removedItems", removedValues(before.items(), after.items()));
        result.put("changedItems", changedValues(before.items(), after.items()));
        result.put("addedAssemblies", addedValues(before.assemblies(), after.assemblies()));
        result.put("removedAssemblies", removedValues(before.assemblies(), after.assemblies()));
        result.put("changedAssemblies", changedValues(before.assemblies(), after.assemblies()));
        return result;
    }

    private Map<String, Integer> addedValues(Map<String, Integer> before, Map<String, Integer> after) {
        var result = new LinkedHashMap<String, Integer>();
        after.forEach((id, quantity) -> {
            if (!before.containsKey(id)) result.put(id, quantity);
        });
        return result;
    }

    private Map<String, Integer> removedValues(Map<String, Integer> before, Map<String, Integer> after) {
        var result = new LinkedHashMap<String, Integer>();
        before.forEach((id, quantity) -> {
            if (!after.containsKey(id)) result.put(id, quantity);
        });
        return result;
    }

    private Map<String, Map<String, Integer>> changedValues(Map<String, Integer> before, Map<String, Integer> after) {
        var result = new LinkedHashMap<String, Map<String, Integer>>();
        after.forEach((id, quantity) -> {
            Integer previous = before.get(id);
            if (previous != null && previous.intValue() != quantity) {
                result.put(id, Map.of("before", previous, "after", quantity));
            }
        });
        return result;
    }

    private record RequestedContents(Map<String, Integer> items, Map<String, Integer> assemblies) {}

    private String nextOrderCode(EventOccurrence event, Faction faction) {
        String factionPart = faction.slug.replaceAll("[^a-zA-Z0-9]", "").toUpperCase(Locale.ROOT);
        String prefix = event.eventType.toUpperCase(Locale.ROOT)
                + String.format("%02d", event.startDate.getYear() % 100) + "-" + factionPart + "-";
        orm.lockOrderCodeScope(faction);
        long sequence = orm.countOrderCodes(prefix + "%") + 1;
        return prefix + String.format("%02d", sequence);
    }

    private String actionFor(DomainEnums.OrderStatus status) {
        return switch (status) {
            case submitted -> "submitted";
            case draft -> "submission_reopened";
            case preparing -> "preparation_reopened";
            case ready -> "ready";
            case picked_up -> "picked_up";
            case closed -> "closed";
            case cancelled -> "cancelled";
            default -> status.name();
        };
    }

    private void applyPickupPoint(FactionOrder order, Double requestedLatitude, Double requestedLongitude) {
        Double latitude = requestedLatitude != null
                ? requestedLatitude
                : order.pickupLatitude != null ? order.pickupLatitude
                        : order.pickupLocation == null ? null : order.pickupLocation.latitude;
        Double longitude = requestedLongitude != null
                ? requestedLongitude
                : order.pickupLongitude != null ? order.pickupLongitude
                        : order.pickupLocation == null ? null : order.pickupLocation.longitude;
        if (latitude == null || longitude == null)
            throw ApiException.badRequest("Select an exact pickup point on the map");
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw ApiException.badRequest("Pickup point coordinates are outside the valid range");
        }
        order.pickupLatitude = latitude;
        order.pickupLongitude = longitude;
    }

    private void assertFactionAccess(UserAccount actor, Faction faction) {
        actors.requireFactionAccess(actor, faction.eventType, faction.name);
    }

    private void createReadyNotification(FactionOrder order) {
        var notification = new Notification();
        notification.recipient = order.createdBy;
        notification.factionOrder = order;
        notification.type = "order_ready";
        var payload = new LinkedHashMap<String, Object>();
        payload.put("orderCode", order.orderCode);
        payload.put("event", order.eventOccurrence.name);
        payload.put("faction", order.faction.name);
        if (order.collectorName != null)
            payload.put("collectorName", order.collectorName);
        if (order.pickupLocation != null) {
            payload.put("pickupLocation", order.pickupLocation.name);
            if (order.pickupLocation.latitude != null)
                payload.put("latitude", order.pickupLocation.latitude);
            if (order.pickupLocation.longitude != null)
                payload.put("longitude", order.pickupLocation.longitude);
        }
        notification.payload = payload;
        orm.persist(notification);
    }

    private void orderEvent(String type, FactionOrder order, UserAccount actor, UUID idempotencyKey) {
        events.record(type, "faction_order", order.id, actor == null ? null : actor.id, idempotencyKey,
                Map.of("orderId", order.id.toString(), "orderCode", order.orderCode, "status", order.status.name()));
    }

    private FactionOrder lockedOrder(UUID id) {
        var order = orm.findLockedOrder(id);
        if (order == null)
            throw ApiException.notFound("Faction order not found");
        return order;
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = orm.find(type, id);
        if (value == null)
            throw ApiException.notFound(label + " not found");
        return value;
    }

    private String requiredText(String value, String field) {
        if (value == null || value.isBlank())
            throw ApiException.badRequest(field + " is required");
        return value;
    }

    private LocalDate requiredDate(LocalDate value) {
        if (value == null)
            throw ApiException.badRequest("eventDate is required");
        return value;
    }
}
