package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.model.Assembly;
import org.ash.inventory.operations.internal.model.AssemblyItemId;
import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.CustodyHandover;
import org.ash.inventory.operations.internal.model.CustodyHandoverLine;
import org.ash.inventory.operations.internal.model.DamageReport;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.Faction;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.OrderHistory;
import org.ash.inventory.operations.internal.model.OrderItemRequest;
import org.ash.inventory.operations.internal.model.OrderLine;
import org.ash.inventory.operations.internal.model.OrderLineAssetAssignment;
import org.ash.inventory.operations.internal.model.ReturnReconciliation;
import org.ash.inventory.operations.internal.model.RuntimeEntry;
import org.ash.inventory.operations.internal.model.StockReservation;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.ItemLocks;
import org.ash.inventory.operations.internal.persistence.OrderOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
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
    @jakarta.inject.Inject NotificationService notifications;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.CheckoutEligibility eligibility;
    @jakarta.inject.Inject RuntimeService runtime;
    @jakarta.inject.Inject OrderPickupService pickupGroups;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.persistence.ItemLocks itemLocks;
    @jakarta.inject.Inject OrderAllocationService allocation;
    @jakarta.inject.Inject EquipmentPolicy equipment;
    @jakarta.inject.Inject PositionService positions;
    @jakarta.inject.Inject ItemRequestNotifier requests;
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

    /** Steps that move items toward an event; a closed event blocks them. */
    private static final Set<DomainEnums.OrderStatus> OUTBOUND = Set.of(DomainEnums.OrderStatus.submitted,
            DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready, DomainEnums.OrderStatus.picked_up);
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
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder create(ApiModels.OrderInput input) {
        requireWritable();
        var actor = actors.current();
        if (input.idempotencyKey() != null) {
            var existing = orm.orderByHistoryIdempotencyKey(input.idempotencyKey());
            if (existing != null) {
                if (existing.kind != InventoryOrder.Kind.faction) throw ApiException.conflict("Command belongs to another order kind");
                assertFactionAccess(actor, existing.faction);
                return existing;
            }
        }
        var event = input.eventOccurrenceId() != null
                ? orm.require(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence")
                : catalog.eventForOrder(requiredText(input.eventType(), "eventType"),
                        requiredDate(input.eventDate()));
        requireOpenEvent(event);
        requireBeforeDeadline(event);
        var faction = input.factionId() != null
                ? orm.require(Faction.class, input.factionId(), "Faction")
                : catalog.factionForOrder(event.eventType, requiredText(input.faction(), "faction"));
        requireFactionOfEvent(faction, event, true);
        assertFactionAccess(actor, faction);
        var order = new InventoryOrder();
        order.eventOccurrence = event;
        order.faction = faction;
        order.requestedPickupDate = input.requestedPickupDate();
        order.collectorName = input.collectorName();
        order.notes = input.notes();
        order.createdBy = actor;
        order.orderCode = nextOrderCode(event, faction);
        orm.persist(order);
        replaceItemRequests(order, input.itemRequests());
        replaceLines(order, input);
        audit(order, actor, "created", null, DomainEnums.OrderStatus.draft, input.idempotencyKey(), input.notes(), lineSnapshot(order));
        orderEvent("order.created", order, actor, input.idempotencyKey());
        return order;
    }

    /** Closed events take no new orders, items or handovers; returns and cancellations stay possible. */
    private static void requireBeforeDeadline(EventOccurrence event) {
        if (event != null && event.orderDeadline != null && !Instant.now().isBefore(event.orderDeadline))
            throw ApiException.conflict("The event order deadline has passed");
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder copyAsDraft(UUID id, UUID eventId, UUID commandId) {
        var source = orm.require(InventoryOrder.class, id, "Order"); assertCanView(source);
        var event = orm.require(EventOccurrence.class, eventId, "Event");
        requireOpenEvent(event); requireBeforeDeadline(event);
        if (source.eventOccurrence != null && !source.eventOccurrence.eventType.equals(event.eventType))
            throw ApiException.badRequest("Copy within the same event type");
        var items = new LinkedHashMap<UUID,Integer>();
        for (var line : source.lines) {
            items.merge(line.item.id, line.requestedQuantity, Integer::sum);
        }
        // Linked requests are order lines by now and declined ones stay declined; only open ones carry over.
        var requests = source.itemRequests.stream().filter(request -> request.status() == OrderItemRequest.Status.open)
                .map(request -> new ApiModels.ItemRequestInput(null, request.name, request.quantity, request.link, request.note)).toList();
        if (source.kind == InventoryOrder.Kind.general)
            return createGeneral(new ApiModels.GeneralOrderInput(source.name, source.purpose, eventId, items, requests, commandId));
        var contents = requestedContents(source);
        items.clear();
        contents.items().forEach((key, quantity) -> items.put(UUID.fromString(key), quantity));
        var assemblies = new LinkedHashMap<UUID,Integer>();
        contents.assemblies().forEach((key, quantity) -> assemblies.put(UUID.fromString(key), quantity));
        return create(new ApiModels.OrderInput(event.eventType, source.faction.slug, event.startDate, eventId, source.faction.id,
                null, null, null, null, null, source.notes, items, assemblies, requests, commandId));
    }

    private static void requireOpenEvent(EventOccurrence event) {
        if (event != null && event.closed())
            throw ApiException.conflict("Event " + event.name + " is closed; correct its items on the event page instead");
    }

    private static void requireFactionOfEvent(Faction faction, EventOccurrence event, boolean newReference) {
        if (!faction.eventType.equals(event.eventType))
            throw ApiException.badRequest("Faction must belong to the selected event type");
        if (newReference && !faction.active) throw ApiException.badRequest("Faction is inactive");
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder createGeneral(ApiModels.GeneralOrderInput input) {
        actors.requireGeneralOrders();
        if (input.idempotencyKey() != null) {
            var existing = orm.orderByHistoryIdempotencyKey(input.idempotencyKey());
            if (existing != null) {
                if (existing.kind != InventoryOrder.Kind.general) throw ApiException.conflict("Command belongs to another order kind");
                requireGeneralOwner(existing);
                return existing;
            }
        }
        var order = new InventoryOrder();
        order.kind = InventoryOrder.Kind.general;
        order.createdBy = actors.current();
        assignGeneral(order, input);
        orm.persist(order);
        audit(order, actors.current(), "created", null, order.status, input.idempotencyKey(), null, lineSnapshot(order));
        orderEvent("order.created", order, actors.current(), input.idempotencyKey());
        return order;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder updateGeneral(UUID id, ApiModels.GeneralOrderInput input) {
        var order = lockedOrder(id);
        if (order.kind != InventoryOrder.Kind.general) throw ApiException.notFound("General order not found");
        requireGeneralOwner(order);
        if (order.status != DomainEnums.OrderStatus.draft) throw ApiException.conflict("Only draft general orders can be edited");
        assignGeneral(order, input);
        audit(order, actors.current(), "updated", order.status, order.status, null, null, lineSnapshot(order));
        orderEvent("order.updated", order, actors.current(), null);
        return order;
    }

    private void assignGeneral(InventoryOrder order, ApiModels.GeneralOrderInput input) {
        order.name = requiredText(input.name(), "name").trim();
        order.purpose = requiredText(input.purpose(), "purpose").trim();
        order.eventOccurrence = input.eventOccurrenceId() == null ? null : orm.require(EventOccurrence.class, input.eventOccurrenceId(), "Event");
        requireOpenEvent(order.eventOccurrence);
        requireBeforeDeadline(order.eventOccurrence);
        replaceItemRequests(order, input.itemRequests());
        if (order.id != null) orm.deleteLines(order);
        if (input.requestedQuantities() == null) return;
        for (var entry : input.requestedQuantities().entrySet()) {
            if (entry.getValue() == null || entry.getValue() < 0) throw ApiException.badRequest("Quantities must be non-negative");
            if (entry.getValue() == 0) continue;
            addLine(order, orm.require(Item.class, entry.getKey(), "Item"), null, entry.getValue());
        }
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder update(UUID id, ApiModels.OrderInput input) {
        requireWritable();
        var order = lockedOrder(id);
        if (order.kind != InventoryOrder.Kind.faction) throw ApiException.notFound("Faction order not found");
        assertFactionAccess(actors.current(), order.faction);
        if (order.status != DomainEnums.OrderStatus.draft && order.status != DomainEnums.OrderStatus.submitted) {
            throw ApiException.conflict("Only draft or submitted orders can be edited");
        }
        var before = requestedContents(order);
        var previousEventId = order.eventOccurrence.id;
        var previousFactionId = order.faction.id;
        var event = input.eventOccurrenceId() == null
                ? order.eventOccurrence
                : orm.require(EventOccurrence.class, input.eventOccurrenceId(), "Event occurrence");
        requireOpenEvent(event);
        requireBeforeDeadline(event);
        var faction = input.factionId() != null
                ? orm.require(Faction.class, input.factionId(), "Faction")
                : input.faction() == null ? order.faction : catalog.factionForOrder(event.eventType, input.faction());
        requireFactionOfEvent(faction, event, !faction.id.equals(order.faction.id));
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
        replaceItemRequests(order, input.itemRequests());
        replaceLines(order, input);
        var changes = contentChanges(before, requestedContents(order));
        changes.put("itemRequests", requestSnapshot(order));
        if (!previousEventId.equals(event.id)) changes.put("eventOccurrenceId", event.id.toString());
        if (!previousFactionId.equals(faction.id)) changes.put("factionId", faction.id.toString());
        audit(order, actors.current(), "updated", order.status, order.status, null, input.notes(), changes);
        orderEvent("order.updated", order, actors.current(), null);
        if (order.status == DomainEnums.OrderStatus.submitted) notifyItemOwners(order, actors.current());
        return order;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder prepare(UUID id, ApiModels.PreparationInput input) {
        actors.requireWarehouse();
        if (input == null) throw ApiException.badRequest("Preparation data is required");
        var order = lockedOrder(id);
        if (idempotent(order, input.idempotencyKey()))
            return order;
        requireOpenEvent(order.eventOccurrence);
        var lines = orm.lines(order);
        if (order.status == DomainEnums.OrderStatus.submitted)
            transition(order, DomainEnums.OrderStatus.preparing, null, "preparation_started", input.notes(), Map.of());
        else if (order.status != DomainEnums.OrderStatus.preparing)
            throw ApiException.conflict("Order must be submitted or preparing");

        releaseAssetAssignments(order);
        var requestedByItem = aggregate(lines, false);
        var orderedIds = requestedByItem.keySet().stream().map(item -> item.id).collect(java.util.stream.Collectors.toSet());
        if (input.preparedQuantities() != null && (!orderedIds.containsAll(input.preparedQuantities().keySet()) || input.preparedQuantities().values().stream().anyMatch(java.util.Objects::isNull)))
            throw ApiException.badRequest("Preparation must reference ordered items");
        if (input.assetAssignments() != null && !orderedIds.containsAll(input.assetAssignments().keySet())) throw ApiException.badRequest("Asset assignments must reference ordered items");
        if (input.sourceAllocations() != null && !orderedIds.containsAll(input.sourceAllocations().keySet())) throw ApiException.badRequest("Sources must reference ordered items");
        if (order.kind == InventoryOrder.Kind.general && input.preparedQuantities() == null) throw ApiException.badRequest("Enter prepared quantities");
        itemLocks.lock(requestedByItem.keySet().stream().map(item -> item.id).toList());
        var assignedAssetIds = new HashSet<UUID>();
        var sources = new LinkedHashMap<UUID, Map<org.ash.inventory.operations.internal.model.InventoryPosition, Integer>>();
        for (var entry : requestedByItem.entrySet()) {
            var lockedItem = orm.findLocked(Item.class, entry.getKey().id);
            if (lockedItem == null) throw ApiException.notFound("Item not found");
            int prepared = input.preparedQuantities() == null ? 0
                : input.preparedQuantities().getOrDefault(entry.getKey().id, 0);
            if (prepared < 0 || prepared > entry.getValue())
                throw ApiException
                        .badRequest("Prepared quantity for " + entry.getKey().name + " is outside the requested range");
            if (prepared > 0) eligibility.assertCheckoutAllowed(lockedItem);
            int currentReservation = lines.stream().filter(line -> line.item.id.equals(entry.getKey().id))
                    .mapToInt(line -> line.preparedQuantity).sum();
            int availableIncludingThisOrder = inventory.availableFor(lockedItem, order.eventOccurrence,
                    lockedItem.trackingMode == DomainEnums.TrackingMode.serialized ? 0 : currentReservation);
            if (prepared > availableIncludingThisOrder && (!input.acknowledgeShortages() || order.kind == InventoryOrder.Kind.general)) {
                throw ApiException.conflict("Only " + availableIncludingThisOrder + " units of " + entry.getKey().name
                        + " can be reserved");
            }
            int actualPrepared = Math.min(prepared, availableIncludingThisOrder);
            if (lockedItem.trackingMode != DomainEnums.TrackingMode.serialized) {
                var selected = input.sourceAllocations() == null ? null : input.sourceAllocations().get(lockedItem.id);
                var allocated = allocation.allocate(lockedItem, allocation.capacity(lockedItem, order.id), actualPrepared, selected,
                        input.acknowledgeShortages() && order.kind == InventoryOrder.Kind.faction);
                actualPrepared = allocated.values().stream().mapToInt(Integer::intValue).sum();
                sources.put(lockedItem.id, allocated);
            } else if (input.sourceAllocations() != null && input.sourceAllocations().containsKey(lockedItem.id)) {
                throw ApiException.badRequest("Serialized preparation selects assets, not quantity positions");
            }
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
        reconcileReservations(order, lines, actors.current(), sources);
        order.preparedBy = actors.current();
        audit(order, actors.current(), "preparation_saved", order.status, order.status, input.idempotencyKey(),
                input.notes(), lineSnapshot(order));
        orderEvent("order.prepared", order, actors.current(), input.idempotencyKey());
        return order;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder transition(UUID id, DomainEnums.OrderStatus target, ApiModels.TransitionInput input) {
        requireTransitionRole(target);
        requireWritable();
        var order = lockedOrder(id);
        var actor = actors.current();
        if (order.kind == InventoryOrder.Kind.general) requireGeneralTransition(order, target);
        if (idempotent(order, input.idempotencyKey()))
            return order;
        if (OUTBOUND.contains(target)) requireOpenEvent(order.eventOccurrence);
        if (target == DomainEnums.OrderStatus.submitted) requireBeforeDeadline(order.eventOccurrence);
        if (order.kind == InventoryOrder.Kind.faction && (target == DomainEnums.OrderStatus.submitted || target == DomainEnums.OrderStatus.draft))
            assertFactionAccess(actor, order.faction);
        else if (target == DomainEnums.OrderStatus.cancelled)
            requireCancel(order, actor);
        if (target == DomainEnums.OrderStatus.ready) {
            var lines = orm.lines(order);
            boolean nonePrepared = lines.stream().allMatch(line -> line.preparedQuantity == 0);
            if (nonePrepared)
                throw ApiException.conflict("An order cannot be ready before any items are prepared");
            order.pickupLocation = input.pickupLocation() == null ? order.pickupLocation
                    : orm.require(StorageLocation.class, input.pickupLocation(), "Pickup location");
            // Handed-out assets are booked into the pickup location.
            LocationHierarchyService.requireStockLocation(order.pickupLocation);
            if (order.kind == InventoryOrder.Kind.faction) applyPickupPoint(order, input.pickupLatitude(), input.pickupLongitude());
            order.readyBy = actor;
        }
        if (target == DomainEnums.OrderStatus.picked_up) {
            order.collectorName = input.collectorName() == null ? order.collectorName : input.collectorName();
            pickup(order, actor, input.idempotencyKey());
            order.pickedUpBy = actor;
        }
        if (target == DomainEnums.OrderStatus.cancelled) {
            releaseReservations(order);
            clearPreparation(order);
        }
        if (order.status == DomainEnums.OrderStatus.preparing && target == DomainEnums.OrderStatus.submitted) {
            releaseReservations(order);
            clearPreparation(order);
        }
        if (target == DomainEnums.OrderStatus.closed && hasOutstanding(order))
            throw ApiException.conflict("Order still has outstanding units");
        transition(order, target, input.idempotencyKey(), actionFor(target), input.notes(), lineSnapshot(order));
        // Consumables are consumed at pickup; an order holding nothing returnable is complete at once.
        if (target == DomainEnums.OrderStatus.picked_up && !hasOutstanding(order)) {
            order.returnedBy = actor;
            transition(order, DomainEnums.OrderStatus.returned, null, "returned", "Only consumables: consumed at pickup", lineSnapshot(order));
        }
        if (target == DomainEnums.OrderStatus.ready && !pickupGroups.alreadyNotified(order.createdBy, "order_ready", order.kind.name(), order.id)) {
            if (order.kind == InventoryOrder.Kind.faction) createReadyNotification(order);
            else pickupGroups.notifyCreatorReady(order.kind.name(), order.id);
        }
        if (target == DomainEnums.OrderStatus.submitted || target == DomainEnums.OrderStatus.ready)
            pickupGroups.notifyResponsible(order.kind.name(), order.id, target == DomainEnums.OrderStatus.ready ? "order_group_ready" : "order_items_assigned");
        if (target == DomainEnums.OrderStatus.submitted) notifyItemOwners(order, actor);
        return order;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder returnItems(UUID id, ApiModels.ReturnInput input) {
        actors.requireWarehouse();
        if (input == null || input.lines() == null || input.lines().isEmpty()) throw ApiException.badRequest("Enter a return outcome");
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
        itemLocks.lock(input.lines().keySet());
        for (var entry : input.lines().entrySet()) {
            var item = orm.findLocked(Item.class, entry.getKey());
            if (item == null)
                throw ApiException.notFound("Item not found");
            var relevant = lines.stream().filter(line -> line.item.id.equals(item.id)).toList();
            if (relevant.stream().noneMatch(line -> line.handedOverQuantity > 0)) throw ApiException.badRequest("Item was not handed over on this order");
            int outstanding = relevant.stream().mapToInt(this::outstandingQuantity).sum();
            var outcome = entry.getValue();
            StockTransaction damagedCheckin = null;
            OrderReturnPolicy.validate(item, new OrderReturnPolicy.Outcome(outcome.returned(), outcome.damaged(),
                    outcome.writtenOff(), outcome.missing(), outcome.notes()), outstanding, actors);
            if (item.trackingMode != DomainEnums.TrackingMode.serialized)
                OrderReturnPolicy.validateReading(item, outcome.operatingHours(), item.currentOperatingHours,
                        outcome.returned() + outcome.damaged() > 0, item.name);
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                applySerializedAssetOutcomes(item, order, actor, outcome, input.idempotencyKey(), assetOutcomes,
                        assignmentsByAsset, handoverDetails);
            } else {
                distributeReturn(order, relevant, item, actor, outcome.returned(),
                        outcome.damaged(), outcome.writtenOff(), outcome.missing(), input.idempotencyKey(),
                        outcome.notes(), handoverDetails);
                if (outcome.returned() > 0)
                    createReturnTransaction(item, order, actor, DomainEnums.TransactionType.checkin,
                            outcome.returned(), input.idempotencyKey(), "returned", outcome.notes());
                if (outcome.damaged() > 0)
                    damagedCheckin = createReturnTransaction(item, order, actor, DomainEnums.TransactionType.checkin,
                            outcome.damaged(), input.idempotencyKey(), "damaged", "Returned damaged: " + outcome.notes());
                if (outcome.writtenOff() > 0)
                    createReturnTransaction(item, order, actor, DomainEnums.TransactionType.written_off,
                            outcome.writtenOff(), input.idempotencyKey(), "written_off", outcome.notes());
            }
            if (item.trackingMode != DomainEnums.TrackingMode.serialized && outcome.damaged() > 0) {
                var damage = new DamageReport();
                damage.item = item;
                damage.reporter = actor;
                damage.order = order;
                damage.quantity = outcome.damaged();
                damage.severity = OrderReturnPolicy.RETURN_DAMAGE_SEVERITY;
                damage.description = OrderReturnPolicy.damageDescription(outcome.notes(), order.label());
                orm.persist(damage);
                positions.reportReturnedDamage(damage, damagedCheckin);
            }
            if (item.trackingMode != DomainEnums.TrackingMode.serialized && outcome.operatingHours() != null) {
                runtime.record(item, null, outcome.operatingHours(), null, order, RuntimeEntry.Source.return_check, null);
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

    /**
     * Unused consumables come back after pickup, also once the order is complete: the units move from consumed to
     * returned on the order lines and go back to stock, so the event's actual consumption stays exact. The total never
     * exceeds what is still booked as consumed, and a repeated command changes nothing.
     */
    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder restockUnused(UUID id, ApiModels.OrderRestockInput input) {
        actors.requireWarehouse();
        if (input == null || input.quantities() == null || input.quantities().isEmpty())
            throw ApiException.badRequest("Enter the unused quantity to restock");
        var order = lockedOrder(id);
        if (idempotent(order, input.idempotencyKey())) return order;
        if (!Set.of(DomainEnums.OrderStatus.picked_up, DomainEnums.OrderStatus.partially_returned,
                DomainEnums.OrderStatus.returned, DomainEnums.OrderStatus.closed).contains(order.status))
            throw ApiException.conflict("Consumables can be restocked once the order is picked up");
        var actor = actors.current();
        var destination = input.locationId() == null ? null : orm.require(StorageLocation.class, input.locationId(), "Storage location");
        var lines = orm.lines(order);
        var details = new ArrayList<ReturnHandoverDetail>();
        itemLocks.lock(input.quantities().keySet());
        for (var entry : input.quantities().entrySet()) {
            var item = orm.findLocked(Item.class, entry.getKey());
            if (item == null) throw ApiException.notFound("Item not found");
            if (!item.consumable()) throw ApiException.badRequest(item.name + " is not a consumable; record its return instead");
            int quantity = entry.getValue();
            var relevant = lines.stream().filter(line -> line.item.id.equals(item.id)).toList();
            int restockable = relevant.stream().mapToInt(line -> line.consumedQuantity).sum();
            if (quantity > restockable)
                throw ApiException.badRequest("Only " + restockable + " of " + item.name + " can be restocked on this order");
            int remaining = quantity;
            for (var line : relevant) {
                int take = Math.min(remaining, line.consumedQuantity);
                if (take == 0) continue;
                line.consumedQuantity -= take;
                line.returnedQuantity += take;
                recordReconciliation(order, line, item, actor, DomainEnums.ReconciliationOutcome.returned_good, take,
                        input.idempotencyKey(), input.notes() == null ? "Unused consumable restocked" : input.notes());
                details.add(new ReturnHandoverDetail(line, null, take, input.notes()));
                remaining -= take;
                if (remaining == 0) break;
            }
            restockTransactions(item, order, actor, quantity, destination, input.idempotencyKey(), input.notes());
        }
        createReturnHandover(order, actor, input.idempotencyKey(),
                new ApiModels.ReturnInput(Map.of(), Map.of(), input.idempotencyKey(), input.notes()), details);
        audit(order, actor, "restocked", order.status, order.status, input.idempotencyKey(), input.notes(), lineSnapshot(order));
        orderEvent("order.restocked", order, actor, input.idempotencyKey());
        return order;
    }

    /** Unused units back to stock (check-in) and out of the consumed total (negative consumption), on the order. */
    private void restockTransactions(Item item, InventoryOrder order, UserAccount actor, int quantity,
            StorageLocation destination, UUID clientCommandId, String notes) {
        var checkin = new StockTransaction();
        checkin.item = item;
        checkin.user = actor;
        checkin.order = order;
        checkin.eventOccurrence = order.eventOccurrence;
        checkin.eventType = order.eventOccurrence == null ? null : order.eventOccurrence.eventType;
        checkin.faction = order.factionLabel();
        checkin.type = DomainEnums.TransactionType.checkin;
        checkin.quantity = quantity;
        checkin.reason = "Unused consumable restocked " + order.label();
        checkin.notes = notes;
        checkin.idempotencyKey = transactionKey(clientCommandId, order, item, "restock");
        checkin.relatedEntityType = InventoryOperationsService.RESTOCK;
        checkin.relatedEntityId = order.id;
        checkin.clientCommandId = clientCommandId;
        checkin.sourceLocation = order.pickupLocation;
        checkin.destinationLocation = destination != null ? destination : item.returnLocation != null ? item.returnLocation : item.storageLocation;
        checkin.availabilityBefore = inventory.stock(item).available();
        positions.apply(checkin);
        orm.persist(checkin);
        checkin.availabilityAfter = inventory.stock(item).available();
        var unconsumed = new StockTransaction();
        unconsumed.item = item;
        unconsumed.user = actor;
        unconsumed.order = order;
        unconsumed.eventOccurrence = checkin.eventOccurrence;
        unconsumed.eventType = checkin.eventType;
        unconsumed.faction = checkin.faction;
        unconsumed.type = DomainEnums.TransactionType.consumed;
        unconsumed.quantity = -quantity;
        unconsumed.reason = checkin.reason;
        unconsumed.notes = notes;
        unconsumed.idempotencyKey = transactionKey(clientCommandId, order, item, "restock-consumed");
        unconsumed.relatedEntityType = InventoryOperationsService.RESTOCK;
        unconsumed.relatedEntityId = order.id;
        unconsumed.clientCommandId = clientCommandId;
        unconsumed.availabilityBefore = checkin.availabilityAfter;
        unconsumed.availabilityAfter = checkin.availabilityAfter;
        unconsumed.createdAt = checkin.createdAt.plusNanos(1_000);
        orm.persist(unconsumed);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand(usage = true)
    public InventoryOrder returnAll(UUID id, UUID idempotencyKey) {
        actors.requireWarehouse();
        var order = lockedOrder(id);
        if (idempotent(order, idempotencyKey)) return order;
        var lines = orm.lines(order);
        var outcomes = new LinkedHashMap<UUID, ApiModels.ReturnLine>();
        var assetOutcomes = new LinkedHashMap<UUID, ApiModels.AssetReturnLine>();
        for (var entry : aggregateOutstanding(lines).entrySet())
            if (entry.getValue() > 0) outcomes.put(entry.getKey().id,
                    new ApiModels.ReturnLine(entry.getValue(), 0, 0, 0, null, "Full order return"));
        for (var assignment : orm.assetAssignments(order)) {
            if (assignment.reconciled) continue;
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

    /** Faction leaders read only orders of their assigned factions. */
    public void assertCanView(InventoryOrder order) {
        actors.requireReader();
        var actor = actors.current();
        boolean visible = order.kind == InventoryOrder.Kind.faction
                ? actors.canViewFaction(actor, order.faction) : actors.canViewGeneralOrders(actor);
        if (!visible) throw ApiException.forbidden("You do not have access to this order");
    }

    private void requireGeneralOwner(InventoryOrder order) {
        var actor = actors.current();
        if (actor.role.atLeast(DomainEnums.UserRole.warehouse_crew)) return;
        if (actor.id.equals(order.createdBy.id) && actor.role.atLeast(DomainEnums.UserRole.ash)) return;
        throw ApiException.forbidden("Only the owner or a warehouse worker may change this order");
    }

    private void requireGeneralTransition(InventoryOrder order, DomainEnums.OrderStatus target) {
        if (target == DomainEnums.OrderStatus.submitted || target == DomainEnums.OrderStatus.cancelled) requireGeneralOwner(order);
        if (target == DomainEnums.OrderStatus.draft || target == DomainEnums.OrderStatus.preparing)
            throw ApiException.conflict("Use preparation to start preparing a general order");
        if (target == DomainEnums.OrderStatus.submitted && orm.lines(order).isEmpty())
            throw ApiException.badRequest("Select at least one item");
    }

    private void pickup(InventoryOrder order, UserAccount actor, UUID idempotencyKey) {
        var lines = orm.lines(order);
        var prepared = aggregatePrepared(lines);
        itemLocks.lock(prepared.keySet().stream().map(item -> item.id).toList());
        for (var entry : prepared.entrySet()) {
            var item = orm.findLocked(Item.class, entry.getKey().id);
            eligibility.assertCheckoutAllowed(item);
            equipment.assertPickup(item, order.eventOccurrence);
            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                pickupAssignedAssets(order, item, actor, idempotencyKey, entry.getValue());
                continue;
            }
            int ownReservation = lines.stream().filter(line -> line.item.id.equals(item.id))
                    .mapToInt(line -> line.preparedQuantity).sum();
            int available = inventory.availableFor(item, order.eventOccurrence, ownReservation);
            if (entry.getValue() > available)
                throw ApiException.conflict("Insufficient stock to pick up " + item.name);
            var allocations = new LinkedHashMap<org.ash.inventory.operations.internal.model.InventoryPosition, Integer>();
            for (var reserved : orm.reservations(order))
                if (reserved.item.id.equals(item.id) && reserved.openQuantity() > 0)
                    allocations.merge(reserved.position, reserved.openQuantity(), Math::addExact);
            if (allocations.values().stream().mapToInt(Integer::intValue).sum() != entry.getValue())
                throw ApiException.conflict("Prepared source allocations changed; prepare the order again");
            for (var source : allocations.entrySet()) {
                var position = source.getKey();
                var transaction = new StockTransaction();
                transaction.item = item;
                transaction.user = order.kind == InventoryOrder.Kind.general ? order.createdBy : actor;
                transaction.order = order; transaction.eventOccurrence = order.eventOccurrence;
                transaction.eventType = order.eventOccurrence == null ? null : order.eventOccurrence.eventType;
                transaction.faction = order.factionLabel(); transaction.type = DomainEnums.TransactionType.checkout;
                transaction.quantity = source.getValue();
                transaction.availabilityBefore = inventory.availableFor(item, order.eventOccurrence, ownReservation);
                transaction.reason = "Order pickup " + order.label();
                transaction.idempotencyKey = transactionKey(idempotencyKey, order, item, "pickup:" + (position == null ? "unlocated" : position.id));
                transaction.clientCommandId = idempotencyKey;
                transaction.sourceLocation = position == null ? null : position.location;
                transaction.lot = position == null ? null : position.lot;
                transaction.destinationLocation = order.pickupLocation;
                positions.apply(transaction); orm.persist(transaction);
                transaction.availabilityAfter = inventory.stock(item).available();
                if (item.consumable()) consumeAtPickup(transaction, idempotencyKey);
            }
        }
        for (var line : lines) {
            line.handedOverQuantity = line.preparedQuantity;
            if (line.item.consumable() && line.handedOverQuantity > 0) {
                line.consumedQuantity = line.handedOverQuantity;
                recordReconciliation(order, line, line.item, actor, DomainEnums.ReconciliationOutcome.consumed,
                        line.handedOverQuantity, idempotencyKey, "Consumed at pickup");
            }
        }
        convertReservationsToCustody(order);
        createHandover(order, actor, idempotencyKey, lines);
    }

    /** Consumables are used up, never returned: the pickup books them as consumed, so the order holds no custody of them. */
    private void consumeAtPickup(StockTransaction checkout, UUID idempotencyKey) {
        var consumed = new StockTransaction();
        consumed.item = checkout.item;
        consumed.user = checkout.user;
        consumed.order = checkout.order;
        consumed.eventOccurrence = checkout.eventOccurrence;
        consumed.eventType = checkout.eventType;
        consumed.faction = checkout.faction;
        consumed.type = DomainEnums.TransactionType.consumed;
        consumed.quantity = checkout.quantity;
        consumed.reason = checkout.reason;
        consumed.idempotencyKey = transactionKey(idempotencyKey, checkout.order, checkout.item, "pickup-consumed:" + checkout.id);
        consumed.clientCommandId = idempotencyKey;
        consumed.sourceLocation = checkout.destinationLocation;
        consumed.availabilityBefore = checkout.availabilityAfter;
        consumed.availabilityAfter = checkout.availabilityAfter;
        consumed.createdAt = checkout.createdAt.plusNanos(1_000);
        orm.persist(consumed);
    }

    private void replaceLines(InventoryOrder order, ApiModels.OrderInput input) {
        orm.deleteLines(order);
        int count = 0;
        if (input.requestedQuantities() != null) {
            for (var entry : input.requestedQuantities().entrySet()) {
                if (entry.getValue() == null || entry.getValue() < 1)
                    continue;
                addLine(order, orm.require(Item.class, entry.getKey(), "Item"), null, entry.getValue());
                count++;
            }
        }
        if (input.requestedAssemblyQuantities() != null) {
            for (var entry : input.requestedAssemblyQuantities().entrySet()) {
                if (entry.getValue() == null || entry.getValue() < 1)
                    continue;
                var assembly = orm.require(Assembly.class, entry.getKey(), "Assembly");
                if (!assembly.active) throw ApiException.notFound("Assembly not found");
                for (var component : orm.assemblyItems(assembly)) {
                    addLine(order, component.item, assembly, component.quantity * entry.getValue());
                    count++;
                }
            }
        }
        if (count == 0 && order.itemRequests.isEmpty())
            throw ApiException.badRequest("Add at least one item, assembly or request to the order");
    }

    /**
     * Open requests follow the input; linked, ordered or declined ones belong to procurement and stay as they are.
     * Without a list (e.g. CSV imports) the requests are left unchanged.
     */
    private void replaceItemRequests(InventoryOrder order, List<ApiModels.ItemRequestInput> inputs) {
        if (inputs == null) return;
        var existing = new LinkedHashMap<UUID, OrderItemRequest>();
        order.itemRequests.forEach(request -> existing.put(request.id, request));
        var kept = new HashSet<UUID>();
        int lineNumber = 0;
        for (var input : inputs) {
            var request = input.id() == null ? null : existing.get(input.id());
            if (input.id() != null && request == null) throw ApiException.badRequest("Item request not found on this order");
            if (request != null) {
                kept.add(request.id);
                request.lineNumber = lineNumber++;
                if (request.status() != OrderItemRequest.Status.open) continue;
            } else {
                request = new OrderItemRequest();
                request.order = order;
                request.lineNumber = lineNumber++;
                order.itemRequests.add(request);
            }
            request.name = requiredText(input.name(), "Request name").trim();
            if (request.name.length() > 160) throw ApiException.badRequest("Request name is too long");
            if (input.quantity() < 1) throw ApiException.badRequest("Request quantity must be at least 1");
            request.quantity = input.quantity();
            request.link = requestLink(input.link());
            request.note = input.note() == null || input.note().isBlank() ? null : input.note().trim();
        }
        order.itemRequests.removeIf(request -> request.id != null && !kept.contains(request.id)
                && request.status() == OrderItemRequest.Status.open);
        // Handled requests the input left out keep their place after the listed ones.
        for (var request : order.itemRequests) if (request.id != null && !kept.contains(request.id)) request.lineNumber = lineNumber++;
        order.itemRequests.sort(java.util.Comparator.comparingInt(request -> request.lineNumber));
    }

    /** Orders still being put together take a linked request's item as a line; later ones only record the link. */
    private static final Set<DomainEnums.OrderStatus> TAKES_REQUESTED_LINES = Set.of(DomainEnums.OrderStatus.draft,
            DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.preparing);

    /** Procurement linked an item to the request (the order is locked by the caller). */
    void attachRequestedItem(OrderItemRequest request, UserAccount actor) {
        var order = request.order;
        boolean lineAdded = TAKES_REQUESTED_LINES.contains(order.status);
        if (lineAdded) addLine(order, request.item, null, request.quantity);
        audit(order, actor, "item_request_resolved", order.status, order.status, null, null, Map.of(
                "request", request.name, "itemId", request.item.id.toString(), "quantity", request.quantity, "lineAdded", lineAdded));
        orderEvent("order.item_request_resolved", order, actor, null);
    }

    /** Procurement declined the request (the order is locked by the caller). */
    void recordRequestDecline(OrderItemRequest request, UserAccount actor) {
        var order = request.order;
        audit(order, actor, "item_request_declined", order.status, order.status, null, request.declineReason,
                Map.of("request", request.name, "quantity", request.quantity));
        orderEvent("order.item_request_declined", order, actor, null);
    }

    private static String requestLink(String value) {
        if (value == null || value.isBlank()) return null;
        var link = value.trim();
        if (link.length() > 2000 || !link.matches("(?i)https?://\\S+")) throw ApiException.badRequest("Request link must be an http(s) URL");
        return link;
    }

    private List<Map<String, Object>> requestSnapshot(InventoryOrder order) {
        return order.itemRequests.stream().map(request -> Map.<String, Object>of(
                "name", request.name, "quantity", request.quantity, "status", request.status().name())).toList();
    }

    private void addLine(InventoryOrder order, Item item, Assembly assembly, int quantity) {
        actors.requireItemAccess(item);
        var line = new OrderLine();
        line.order = order;
        line.item = item;
        line.sourceAssembly = assembly;
        line.requestedQuantity = quantity;
        line.lineNumber = order.lines.size() + 1;
        order.lines.add(line);
    }

    private void distributePrepared(List<OrderLine> lines, Item item, int quantity) {
        int remaining = quantity;
        for (var line : lines.stream().filter(candidate -> candidate.item.id.equals(item.id)).toList()) {
            line.preparedQuantity = Math.min(line.requestedQuantity, remaining);
            line.allocatedQuantity = line.preparedQuantity;
            line.reservedQuantity = line.preparedQuantity;
            remaining -= line.preparedQuantity;
        }
    }

    private void assignAssets(InventoryOrder order, List<OrderLine> lines, Item item, List<UUID> assetIds,
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
            allocation.assertAssetEligible(asset, order.eventOccurrence);

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
            assignment.orderLine.assets.add(assignment);
            asset.availabilityStatus = DomainEnums.AssetState.staged;
            asset.currentCustodian = null;
            assignedToLine++;
        }
    }

    private void pickupAssignedAssets(InventoryOrder order, Item item, UserAccount actor, UUID idempotencyKey,
            int preparedQuantity) {
        var assignments = orm.assetAssignments(order, item);
        if (assignments.size() != preparedQuantity)
            throw ApiException.conflict("Serialized asset assignments for " + item.name + " are incomplete");
        for (var assignment : assignments) {
            var asset = orm.findLocked(AssetInstance.class, assignment.assetInstance.id);
            if (asset.availabilityStatus != DomainEnums.AssetState.staged)
                throw ApiException.conflict("Asset " + asset.assetCode + " is no longer staged for this order");
            allocation.assertAssetEligible(asset, order.eventOccurrence);
            int before = inventory.stock(item).available();
            var transaction = new StockTransaction();
            transaction.item = item;
            transaction.assetInstance = asset;
            transaction.user = order.kind == InventoryOrder.Kind.general ? order.createdBy : actor;
            transaction.order = order;
            transaction.eventOccurrence = order.eventOccurrence;
            transaction.eventType = order.eventOccurrence == null ? null : order.eventOccurrence.eventType;
            transaction.faction = order.factionLabel();
            transaction.type = DomainEnums.TransactionType.checkout;
            transaction.quantity = 1;
            transaction.availabilityBefore = before;
            transaction.reason = "Order pickup " + order.label();
            transaction.idempotencyKey = transactionKey(idempotencyKey, order, item, "pickup:" + asset.id);
            transaction.clientCommandId = idempotencyKey;
            transaction.sourceLocation = asset.currentLocation == null ? item.storageLocation : asset.currentLocation;
            transaction.destinationLocation = order.pickupLocation;
            asset.availabilityStatus = DomainEnums.AssetState.in_field;
            asset.currentLocation = order.pickupLocation;
            asset.currentCustodian = null;
            positions.apply(transaction);
        orm.persist(transaction);
            transaction.availabilityAfter = inventory.stock(item).available();
        }
    }

    private void distributeReturn(InventoryOrder order, List<OrderLine> lines, Item item, UserAccount actor,
            int returned, int damaged, int writtenOff, int missing, UUID idempotencyKey, String notes,
            List<ReturnHandoverDetail> handoverDetails) {
        // Write-offs settle units already reported missing before any still-unchecked units.
        int unwritten = distributeOutcomePass(order, lines, item, actor, writtenOff,
                DomainEnums.ReconciliationOutcome.written_off, true, idempotencyKey, notes, handoverDetails);
        int undistributed = distributeOutcomePass(order, lines, item, actor, unwritten,
                DomainEnums.ReconciliationOutcome.written_off, false, idempotencyKey, notes, handoverDetails);
        undistributed += distributeOutcome(order, lines, item, actor, returned,
                DomainEnums.ReconciliationOutcome.returned_good, idempotencyKey, notes, handoverDetails);
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

    private int distributeOutcome(InventoryOrder order, List<OrderLine> lines, Item item, UserAccount actor,
            int quantity, DomainEnums.ReconciliationOutcome outcome, UUID idempotencyKey, String notes,
            List<ReturnHandoverDetail> handoverDetails) {
        int remaining = distributeOutcomePass(order, lines, item, actor, quantity, outcome, false,
                idempotencyKey, notes, handoverDetails);
        return distributeOutcomePass(order, lines, item, actor, remaining, outcome, true, idempotencyKey, notes,
                handoverDetails);
    }

    private int distributeOutcomePass(InventoryOrder order, List<OrderLine> lines, Item item, UserAccount actor,
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
                case returned_damaged -> line.damagedQuantity += take;
                case written_off -> line.writtenOffQuantity += take;
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

    private void reconcileReservations(InventoryOrder order, List<OrderLine> lines, UserAccount actor,
            Map<UUID, Map<org.ash.inventory.operations.internal.model.InventoryPosition, Integer>> sources) {
        for (var old : orm.reservations(order)) if (old.openQuantity() > 0) release(old);
        var remaining = new LinkedHashMap<UUID, Map<org.ash.inventory.operations.internal.model.InventoryPosition, Integer>>();
        sources.forEach((id, allocations) -> remaining.put(id, new LinkedHashMap<>(allocations)));
        for (var line : lines) {
            line.reservedQuantity = line.preparedQuantity;
            line.sourceLocation = null;
            int left = line.preparedQuantity;
            var allocations = remaining.getOrDefault(line.item.id, Map.of());
            for (var entry : allocations.entrySet()) {
                int take = Math.min(left, entry.getValue());
                if (take == 0) continue;
                reserve(order, line, actor, entry.getKey(), take);
                if (line.sourceLocation == null && entry.getKey() != null) line.sourceLocation = entry.getKey().location;
                entry.setValue(entry.getValue() - take); left -= take;
                if (left == 0) break;
            }
            // Serialized units carry their exact sources on the asset assignments. Unlocated bulk remains explicit.
            if (left > 0) reserve(order, line, actor, null, left);
        }
    }

    private void reserve(InventoryOrder order, OrderLine line, UserAccount actor,
            org.ash.inventory.operations.internal.model.InventoryPosition position, int quantity) {
        var reservation = new StockReservation();
        reservation.order = order; reservation.orderLine = line; reservation.item = line.item;
        reservation.position = position; reservation.location = position == null ? null : position.location;
        reservation.requestedQuantity = line.requestedQuantity; reservation.reservedQuantity = quantity;
        reservation.createdBy = actor;
        order.reservations.add(reservation);
        orm.persist(reservation);
    }

    private void releaseReservations(InventoryOrder order) {
        releaseAssetAssignments(order);
        for (var reservation : orm.reservations(order)) {
            if (reservation.openQuantity() > 0) release(reservation);
            reservation.activeAssetKey = null;
        }
        for (var line : orm.lines(order)) line.reservedQuantity = 0;
    }

    private void releaseAssetAssignments(InventoryOrder order) {
        // Item locks precede the asset writes and the flush of the assignment delete.
        itemLocks.lock(orm.lines(order).stream().map(line -> line.item.id).distinct().toList());
        for (var assignment : orm.assetAssignments(order)) {
            var asset = assignment.assetInstance;
            if (asset.availabilityStatus == DomainEnums.AssetState.staged
                    || asset.availabilityStatus == DomainEnums.AssetState.reserved) {
                asset.availabilityStatus = DomainEnums.AssetState.available;
                asset.currentCustodian = null;
            }
        }
        orm.removeAssetAssignments(order);
    }

    private void clearPreparation(InventoryOrder order) {
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

    private void convertReservationsToCustody(InventoryOrder order) {
        for (var reservation : orm.reservations(order)) {
            if (reservation.openQuantity() == 0) continue;
            reservation.releasedQuantity = reservation.reservedQuantity;
            reservation.releasedAt = Instant.now();
            reservation.status = DomainEnums.ReservationStatus.converted_to_custody;
            reservation.activeAssetKey = null;
        }
        for (var line : orm.lines(order)) line.reservedQuantity = 0;
    }

    private void createHandover(InventoryOrder order, UserAccount actor, UUID idempotencyKey,
            List<OrderLine> lines) {
        var handover = new CustodyHandover();
        handover.order = order;
        handover.type = DomainEnums.HandoverType.checkout;
        handover.marshal = actor;
        handover.collectorName = order.collectorLabel();
        handover.location = order.pickupLocation;
        handover.conditionConfirmed = false;
        handover.handoverCode = order.label() + "-OUT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
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

    private void createReturnHandover(InventoryOrder order, UserAccount actor, UUID idempotencyKey,
            ApiModels.ReturnInput input, List<ReturnHandoverDetail> details) {
        var handover = new CustodyHandover();
        handover.order = order;
        handover.type = DomainEnums.HandoverType.checkin;
        handover.marshal = actor;
        handover.collectorName = order.collectorLabel();
        handover.location = order.pickupLocation;
        handover.conditionConfirmed = false;
        handover.handoverCode = order.label() + "-IN-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
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

    private void recordReconciliation(InventoryOrder order, OrderLine line, Item item, UserAccount actor,
            DomainEnums.ReconciliationOutcome outcome, int quantity, UUID idempotencyKey, String notes) {
        recordReconciliation(order, line, item, null, actor, outcome, quantity, idempotencyKey, notes);
    }

    private void recordReconciliation(InventoryOrder order, OrderLine line, Item item, AssetInstance asset,
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

    private StockTransaction createReturnTransaction(Item item, InventoryOrder order, UserAccount actor,
            DomainEnums.TransactionType type,
            int quantity, UUID clientCommandId, String operation, String notes) {
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.user = order.kind == InventoryOrder.Kind.general ? order.createdBy : actor;
        transaction.order = order;
            transaction.eventOccurrence = order.eventOccurrence;
        transaction.eventType = order.eventOccurrence == null ? null : order.eventOccurrence.eventType;
        transaction.faction = order.factionLabel();
        transaction.type = type;
        transaction.quantity = quantity;
        transaction.reason = "Order return " + order.label();
        transaction.notes = notes;
        transaction.idempotencyKey = transactionKey(clientCommandId, order, item, operation);
        transaction.clientCommandId = clientCommandId;
        transaction.sourceLocation = order.pickupLocation;
        transaction.custodyWriteOff = type == DomainEnums.TransactionType.written_off;
        if (type == DomainEnums.TransactionType.checkin)
            transaction.destinationLocation = item.returnLocation == null ? item.storageLocation : item.returnLocation;
        transaction.availabilityBefore = inventory.stock(item).available();
        positions.apply(transaction);
        orm.persist(transaction);
        transaction.availabilityAfter = inventory.stock(item).available();
        return transaction;
    }

    private void applySerializedAssetOutcomes(Item item, InventoryOrder order, UserAccount actor,
            ApiModels.ReturnLine summary, UUID clientCommandId, Map<UUID, ApiModels.AssetReturnLine> outcomes,
            Map<UUID, OrderLineAssetAssignment> assignmentsByAsset, List<ReturnHandoverDetail> handoverDetails) {
        int returned = 0;
        int damaged = 0;
        int writtenOff = 0;
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
            if (assignment.reconciled) throw ApiException.conflict("Asset has already been reconciled on this order");
            var line = assignment.orderLine;
            var assetOutcome = entry.getValue();
            OrderReturnPolicy.validateReading(item, assetOutcome.operatingHours(), asset.operatingHours,
                    assetOutcome.outcome() == DomainEnums.ReconciliationOutcome.returned_good
                            || assetOutcome.outcome() == DomainEnums.ReconciliationOutcome.returned_damaged,
                    asset.assetCode);
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
                            StockPolicy.returnedState(asset), clientCommandId, "returned", notes);
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
                    damage.order = order;
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
                case written_off -> {
                    actors.requireAdmin();
                    if (notes == null || notes.isBlank())
                        throw ApiException.badRequest("Write-off reason is required for asset " + asset.assetCode);
                    if (wasMissing) line.missingQuantity--;
                    line.writtenOffQuantity++;
                    recordReconciliation(order, line, item, asset, actor,
                            DomainEnums.ReconciliationOutcome.written_off, 1, clientCommandId, notes);
                    createSerializedReturnTransaction(item, order, actor, asset, DomainEnums.TransactionType.written_off,
                            DomainEnums.AssetState.written_off, clientCommandId, "written_off", notes);
                    asset.active = false;
                    writtenOff++;
                }
                default -> throw ApiException.badRequest("Unsupported serialized asset return outcome " + assetOutcome.outcome());
            }
            if (assetOutcome.outcome() != DomainEnums.ReconciliationOutcome.missing) assignment.reconciled = true;
            // Returned hours are the meter after the event; validateReading rejected readings below the current meter.
            if (assetOutcome.operatingHours() != null)
                runtime.record(item, asset, assetOutcome.operatingHours(), null, order, RuntimeEntry.Source.return_check, assetOutcome.notes());
        }
        int remainingMissing = assignmentsByAsset.values().stream()
                .filter(assignment -> !assignment.reconciled && assignment.assetInstance.item.id.equals(item.id))
                .map(assignment -> assignment.assetInstance)
                .map(asset -> orm.findLocked(AssetInstance.class, asset.id))
                .mapToInt(asset -> asset.availabilityStatus == DomainEnums.AssetState.lost ? 1 : 0)
                .sum();
        if (returned != summary.returned() || damaged != summary.damaged() || writtenOff != summary.writtenOff()
                || remainingMissing != summary.missing()) {
            throw ApiException.badRequest("Serialized return quantities must match the submitted per-asset outcomes for " + item.name);
        }
    }

    private record ReturnHandoverDetail(OrderLine line, AssetInstance asset, int quantity, String notes) {}

    private void createSerializedReturnTransaction(Item item, InventoryOrder order, UserAccount actor,
            AssetInstance asset, DomainEnums.TransactionType type, DomainEnums.AssetState targetState,
            UUID clientCommandId, String operation, String notes) {
        int before = inventory.stock(item).available();
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.assetInstance = asset;
        transaction.user = order.kind == InventoryOrder.Kind.general ? order.createdBy : actor;
        transaction.order = order;
            transaction.eventOccurrence = order.eventOccurrence;
        transaction.eventType = order.eventOccurrence == null ? null : order.eventOccurrence.eventType;
        transaction.faction = order.factionLabel();
        transaction.type = type;
        transaction.quantity = 1;
        transaction.reason = "Order return " + order.label();
        transaction.notes = notes;
        transaction.idempotencyKey = transactionKey(clientCommandId, order, item, operation + ":" + asset.id);
        transaction.clientCommandId = clientCommandId;
        transaction.sourceLocation = asset.currentLocation == null ? order.pickupLocation : asset.currentLocation;
        transaction.custodyWriteOff = type == DomainEnums.TransactionType.written_off;
        asset.availabilityStatus = targetState;
        asset.currentLocation = targetState == DomainEnums.AssetState.available
                || targetState == DomainEnums.AssetState.damaged ? (item.returnLocation == null ? item.storageLocation : item.returnLocation) : null;
        asset.currentCustodian = null;
        if (type == DomainEnums.TransactionType.checkin)
            transaction.destinationLocation = item.returnLocation == null ? item.storageLocation : item.returnLocation;
        transaction.availabilityBefore = before;
        positions.apply(transaction);
        orm.persist(transaction);
        transaction.availabilityAfter = inventory.stock(item).available();
    }

    private UUID transactionKey(UUID clientCommandId, InventoryOrder order, Item item, String operation) {
        if (clientCommandId == null) return null;
        return UUID.nameUUIDFromBytes((clientCommandId + ":" + order.id + ":" + item.id + ":" + operation)
                .getBytes(StandardCharsets.UTF_8));
    }

    private void transition(InventoryOrder order, DomainEnums.OrderStatus target, UUID idempotencyKey, String action,
            String notes, Map<String, Object> delta) {
        var from = order.status;
        if (!TRANSITIONS.getOrDefault(from, Set.of()).contains(target))
            throw ApiException.conflict("Invalid order transition: " + from + " -> " + target);
        order.status = target;
        audit(order, actors.current(), action, from, target, idempotencyKey, notes, delta);
        orderEvent("order." + target.name(), order, actors.current(), idempotencyKey);
    }

    private void audit(InventoryOrder order, UserAccount actor, String action, DomainEnums.OrderStatus from,
            DomainEnums.OrderStatus to, UUID idempotencyKey, String notes, Map<String, Object> delta) {
        var history = new OrderHistory();
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

    private boolean idempotent(InventoryOrder order, UUID key) {
        if (key == null) return false;
        var existing = orm.orderByHistoryIdempotencyKey(key);
        if (existing != null && !existing.id.equals(order.id)) throw ApiException.conflict("Command belongs to another order");
        return existing != null;
    }

    private boolean hasOutstanding(InventoryOrder order) {
        return orm.lines(order).stream()
                .anyMatch(line -> outstandingQuantity(line) > 0);
    }

    private Map<Item, Integer> aggregate(List<OrderLine> lines, boolean prepared) {
        var values = new LinkedHashMap<Item, Integer>();
        for (var line : lines) {
            int quantity = prepared ? line.preparedQuantity : line.requestedQuantity;
            if (quantity > 0) values.merge(line.item, quantity, Integer::sum);
        }
        return values;
    }

    private Map<Item, Integer> aggregatePrepared(List<OrderLine> lines) {
        return aggregate(lines, true);
    }

    private Map<Item, Integer> aggregateOutstanding(List<OrderLine> lines) {
        var values = new LinkedHashMap<Item, Integer>();
        for (var line : lines)
            values.merge(line.item, outstandingQuantity(line), Integer::sum);
        return values;
    }

    private int outstandingQuantity(OrderLine line) {
        return Math.max(0, CustodyQuantities.outstanding(line));
    }

    private Map<String, Object> lineSnapshot(InventoryOrder order) {
        var rows = new ArrayList<Map<String, Object>>();
        for (var line : orm.lines(order)) {
            var row = new LinkedHashMap<String, Object>();
            row.put("itemId", line.item.id);
            if (line.sourceAssembly != null) row.put("sourceAssemblyId", line.sourceAssembly.id);
            row.put("requested", line.requestedQuantity);
            row.put("prepared", line.preparedQuantity);
            row.put("handedOver", line.handedOverQuantity);
            row.put("returned", line.returnedQuantity);
            row.put("consumed", line.consumedQuantity);
            row.put("writtenOff", line.writtenOffQuantity);
            row.put("missing", line.missingQuantity);
            row.put("damaged", line.damagedQuantity);
            rows.add(row);
        }
        var contents = requestedContents(order);
        return Map.of("lines", rows, "items", contents.items(), "assemblies", contents.assemblies(), "itemRequests", requestSnapshot(order));
    }

    private RequestedContents requestedContents(InventoryOrder order) {
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

    private void applyPickupPoint(InventoryOrder order, Double requestedLatitude, Double requestedLongitude) {
        if (requestedLatitude == null && requestedLongitude == null && pickupGroups.hasPickupPoints("faction", order.id)) return;
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

    /** Shared by REST, MCP and offline replay. */
    private void requireTransitionRole(DomainEnums.OrderStatus target) {
        switch (target) {
            case draft, submitted, cancelled -> actors.requireOrdering();
            case preparing, ready -> actors.requireWarehouse();
            case picked_up -> actors.requireTakeout();
            case closed -> actors.requireWarehouse();
            case partially_returned, returned -> throw ApiException.badRequest("Record returns through the return endpoint");
        }
    }

    /**
     * Faction leaders withdraw their faction's lists before the warehouse starts; once preparation has
     * begun only warehouse workers cancel (the transition table forbids it after pickup).
     */
    private void requireCancel(InventoryOrder order, UserAccount actor) {
        if (order.kind == InventoryOrder.Kind.general) { requireGeneralOwner(order); return; }
        boolean early = order.status == DomainEnums.OrderStatus.draft || order.status == DomainEnums.OrderStatus.submitted;
        boolean member = order.createdBy.id.equals(actor.id) || actors.canWriteFaction(actor, order.faction);
        if (early && member) return;
        actors.requireWarehouse();
    }

    private void requireWritable() {
        actors.requireOrdering();
    }

    private void notifyItemOwners(InventoryOrder order, UserAccount actor) {
        requests.notifyOwners(orm.lines(order).stream().map(line -> line.item).toList(), actor,
                order.kind.name() + "_order", order.label(), order.id.toString());
    }

    private void assertFactionAccess(UserAccount actor, Faction faction) {
        actors.requireFactionAccess(actor, faction);
    }

    private void createReadyNotification(InventoryOrder order) {
        var payload = new LinkedHashMap<String, Object>();
        payload.put("orderCode", order.label());
        payload.put("event", order.eventOccurrence.name);
        payload.put("faction", order.factionLabel());
        var plan = pickupGroups.get("faction", order.id);
        payload.put("groupCount", plan.groups().size());
        payload.put("path", OrderPickupService.path("faction", order.id));
        if (order.collectorName != null)
            payload.put("collectorName", order.collectorName);
        if (order.pickupLocation != null) {
            payload.put("pickupLocation", order.pickupLocation.name);
            if (order.pickupLocation.latitude != null)
                payload.put("latitude", order.pickupLocation.latitude);
            if (order.pickupLocation.longitude != null)
                payload.put("longitude", order.pickupLocation.longitude);
        }
        if (plan.pickupPointsComplete()) payload.remove("pickupLocation");
        notifications.enqueue(order.createdBy.id, order.id, "order_ready", "ready:" + order.id, payload);
    }

    private void orderEvent(String type, InventoryOrder order, UserAccount actor, UUID idempotencyKey) {
        events.record(type, "order", order.id, actor == null ? null : actor.id, idempotencyKey,
                Map.of("orderId", order.id.toString(), "orderCode", order.label(), "kind", order.kind.name(), "status", order.status.name()));
    }

    private InventoryOrder lockedOrder(UUID id) {
        var order = orm.findLockedOrder(id);
        if (order == null)
            throw ApiException.notFound("Order not found");
        return order;
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
