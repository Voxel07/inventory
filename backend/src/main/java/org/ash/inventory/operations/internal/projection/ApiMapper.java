package org.ash.inventory.operations.internal.projection;

import org.ash.inventory.blobs.api.BlobStore;
import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.operations.internal.application.EventMetricsService;
import org.ash.inventory.operations.internal.application.InventoryAccessService;
import org.ash.inventory.operations.internal.application.LocationHierarchyService;
import org.ash.inventory.operations.internal.application.MaintenanceProjectionService;
import org.ash.inventory.operations.internal.application.OrderQuantities;
import org.ash.inventory.operations.internal.application.PrivacyProjectionService;
import org.ash.inventory.operations.internal.application.StockState;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.Assembly;
import org.ash.inventory.operations.internal.model.AssemblyItem;
import org.ash.inventory.operations.internal.model.AssemblyItemId;
import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DamageReport;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.Faction;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.ItemImage;
import org.ash.inventory.operations.internal.model.MaintenanceRecord;
import org.ash.inventory.operations.internal.model.OrderHistory;
import org.ash.inventory.operations.internal.model.OrderItemRequest;
import org.ash.inventory.operations.internal.model.OrderLine;
import org.ash.inventory.operations.internal.model.ReturnSubmission;
import org.ash.inventory.operations.internal.model.RuntimeEntry;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.SyncCommandAudit;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.AssetReservationOrm;
import org.ash.inventory.operations.internal.security.ActorService;

import jakarta.enterprise.context.ApplicationScoped;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class ApiMapper {
    @jakarta.inject.Inject org.ash.inventory.operations.internal.security.ActorService actors;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.InventoryAccessService accessPolicies;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.persistence.AssetReservationOrm assetReservations;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.PrivacyProjectionService privacy;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.MaintenanceProjectionService maintenance;
    private final BlobStore media;
    public ApiMapper(BlobStore media) { this.media = media; }

    public void prepareItems(List<Item> items) { accessPolicies.prepareItems(items); maintenance.prepare(items); }
    public void prepareLocations(java.util.Collection<StorageLocation> locations) { accessPolicies.prepareLocations(locations); }
    private boolean canViewLocation(StorageLocation value) { return value != null && accessPolicies.projectionAllows(value.accessPolicy); }

    public ApiResponses.UserResponse user(UserAccount value) {
        return user(value, null);
    }

    /** The signed-in user, including their own preferences. */
    public ApiResponses.UserResponse currentUser(UserAccount value) {
        return user(value, value.mobileNavigation);
    }

    private ApiResponses.UserResponse user(UserAccount value, Map<String, String> mobileNavigation) {
        return new ApiResponses.UserResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.email,
                value.role.name(),
                value.roles.stream().map(Enum::name).toList(),
                value.factions == null ? List.of() : value.factions,
                value.accessRevision, value.active,
                mobileNavigation
        );
    }

    public ApiResponses.ActorSummary actor(UserAccount value) {
        return new ApiResponses.ActorSummary(value.id, value.name);
    }

    public ApiResponses.GeneralOrderResponse generalOrder(InventoryOrder value, Map<String, String> itemNames,
            List<org.ash.inventory.operations.internal.model.OrderHistory> history) {
        return new ApiResponses.GeneralOrderResponse(
                value.kind.name(),
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.purpose,
                value.createdBy.id.toString(),
                value.eventOccurrence == null ? null : value.eventOccurrence.id.toString(),
                value.status.name(),
                value.quantities(line -> line.requestedQuantity),
                value.quantities(line -> line.handedOverQuantity),
                value.quantities(line -> line.returnedQuantity),
                value.quantities(line -> line.consumedQuantity),
                value.perItem(org.ash.inventory.operations.internal.model.OrderLine::assetIds),
                itemNames,
                value.quantities(line -> line.preparedQuantity),
                value.quantities(line -> line.damagedQuantity),
                value.quantities(line -> line.missingQuantity),
                value.quantities(line -> line.writtenOffQuantity),
                value.perItem(org.ash.inventory.operations.internal.model.OrderLine::reconciledAssetIds),
                history.stream().map(this::history).toList(),
                itemRequests(value),
                Map.of("createdBy", actor(value.createdBy)), value.sourceAllocations()
        );
    }

    public ApiResponses.GeneralOrderSummaryResponse generalOrderSummary(InventoryOrder value, Map<String, String> itemNames) {
        return new ApiResponses.GeneralOrderSummaryResponse(
                value.kind.name(),
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.purpose,
                value.createdBy.id.toString(),
                value.eventOccurrence == null ? null : value.eventOccurrence.id.toString(),
                value.status.name(),
                value.quantities(line -> line.requestedQuantity),
                value.quantities(line -> line.handedOverQuantity),
                value.quantities(line -> line.returnedQuantity),
                value.quantities(line -> line.consumedQuantity),
                value.perItem(org.ash.inventory.operations.internal.model.OrderLine::assetIds),
                itemNames,
                value.quantities(line -> line.preparedQuantity),
                value.quantities(line -> line.damagedQuantity),
                value.quantities(line -> line.missingQuantity),
                value.quantities(line -> line.writtenOffQuantity),
                value.perItem(org.ash.inventory.operations.internal.model.OrderLine::reconciledAssetIds),
                itemRequests(value),
                Map.of("createdBy", actor(value.createdBy)), value.sourceAllocations()
        );
    }

    public List<ApiResponses.StorageLocationResponse> locations(List<StorageLocation> values) {
        prepareLocations(values);
        return values.stream().map(this::location).toList();
    }
    private String locationPath(StorageLocation value) {
        var names = new java.util.LinkedList<String>();
        var seen = new java.util.HashSet<UUID>();
        for (var current = value; current != null && seen.add(current.id) && canViewLocation(current); current = current.parent)
            names.addFirst(current.name);
        return String.join(" / ", names);
    }
    private String visibleLocationCode(StorageLocation value) {
        var codes = new java.util.LinkedList<String>();
        var seen = new java.util.HashSet<UUID>();
        for (var current = value; current != null && seen.add(current.id) && canViewLocation(current); current = current.parent)
            codes.addFirst(current.code);
        return String.join(org.ash.inventory.operations.internal.application.LocationHierarchyService.CODE_SEPARATOR, codes);
    }
    private Integer visibleDepth(StorageLocation value) {
        int depth = 0;
        var seen = new java.util.HashSet<UUID>();
        for (var current = value; current.parent != null; current = current.parent) {
            if (!seen.add(current.id) || !canViewLocation(current.parent)) return null;
            depth++;
        }
        return depth;
    }
    /** The topmost ancestor the viewer may see (normally the top-level location). */
    private StorageLocation visibleRoot(StorageLocation value) {
        var root = value;
        var seen = new java.util.HashSet<UUID>(java.util.List.of(value.id));
        while (root.parent != null && seen.add(root.parent.id) && canViewLocation(root.parent)) root = root.parent;
        return root;
    }
    /** Storage places show the map of their nearest visible section or location. */
    private StorageLocation mapSource(StorageLocation value) {
        if (value.depth() < 2) return value;
        var seen = new java.util.HashSet<UUID>();
        for (var current = value.parent; current != null && seen.add(current.id) && canViewLocation(current); current = current.parent)
            if (current.latitude != null && current.longitude != null) return current;
        return value;
    }

    public ApiResponses.StorageLocationResponse location(StorageLocation value) {
        boolean staff = actors.current().role.atLeast(DomainEnums.UserRole.warehouse_crew);
        var root = visibleRoot(value);
        var map = mapSource(value);
        return new ApiResponses.StorageLocationResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.code,
                visibleLocationCode(value),
                visibleDepth(value),
                value.description,
                map.latitude,
                map.longitude,
                map.mapZoom,
                media.mediaReference(map.mapOverlayUrl),
                map.overlayBounds,
                root.id.toString(),
                root.name,
                canViewLocation(value.parent) ? value.parent.id.toString() : null,
                value.active, accessPolicies.projection(value.accessPolicy), locationPath(value),
                !staff || value.keeperUser == null ? null : value.keeperUser.id,
                !staff || value.keeperUser == null ? null : value.keeperUser.name
        );
    }

    public ApiResponses.ItemResponse item(Item value, StockState state,
            List<org.ash.inventory.operations.internal.model.ItemImage> images, int ordered) {
        var imageReferences = images.stream()
                .map(image -> media.mediaReference(image.objectKey))
                .toList();
        Map<String, Object> expand = new LinkedHashMap<>();
        if (canViewLocation(value.storageLocation)) expand.put("storageLocation", location(value.storageLocation));
        if (canViewLocation(value.returnLocation)) expand.put("returnLocation", location(value.returnLocation));

        ApiResponses.StockDto stockDto = state == null ? null : new ApiResponses.StockDto(
                value.accessPolicy != null || value.ownershipType == Item.Ownership.organization ? state.totalOwned() : 0,
                state.onHand(),
                state.checkedOut(),
                state.inTransit(),
                state.damaged(),
                state.reserved(),
                state.available(),
                maintenance.quantity(value, state),
                ordered
        );

        return new ApiResponses.ItemResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.sku,
                value.name,
                value.description,
                value.minStock,
                BigDecimal.valueOf(value.unitValueCents, 2),
                value.category,
                value.subcategory,
                value.supplier,
                value.eventTags == null ? List.of() : value.eventTags,
                value.consumable(),
                value.trackingMode.name(),
                value.inventoryRole.name(),
                value.unit,
                value.quantityDecimals,
                value.unitCapacity,
                canViewLocation(value.storageLocation) ? value.storageLocation.id.toString() : null,
                canViewLocation(value.returnLocation) ? value.returnLocation.id.toString() : null,
                value.active ? "available" : "retired",
                imageReferences,
                value.hint,
                canViewLocation(value.storageLocation) ? value.positionDetails : null,
                value.containerSize,
                value.containerSize == null || state == null ? null : Math.max(0, state.onHand()) / value.containerSize.intValueExact(),
                value.containerSize == null || state == null ? null : Math.max(0, state.onHand()) % value.containerSize.intValueExact(),
                maintenance.due(value, null),
                value.currentOperatingHours,
                value.tracksRuntime,
                value.fuelConsumptionLitersPer100Km,
                value.batteryReplacementDue,
                value.bestBeforeDate,
                maintenance.status(value, null),
                maintenance.blocking(value),
                stockDto,
                expand, accessPolicies.projection(value.accessPolicy), !canViewLocation(value.storageLocation) && value.storageLocation != null
        );
    }

    public ApiResponses.ReturnSubmissionResponse returnSubmission(ReturnSubmission value,
            List<ApiResponses.ReturnDamageResponse> reportedDamage) {
        return new ApiResponses.ReturnSubmissionResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.item.id.toString(),
                value.item.name,
                value.quantity,
                value.assetInstance == null ? null : value.assetInstance.id.toString(),
                value.assetInstance == null ? null : value.assetInstance.assetCode,
                value.returnedFor.id.toString(),
                value.returnedFor.name,
                value.submittedBy.id.toString(),
                value.submittedBy.name,
                value.order == null ? null : value.order.id.toString(),
                value.expectedReturnLocation == null ? null : value.expectedReturnLocation.id.toString(),
                value.expectedReturnLocation == null ? null : value.expectedReturnLocation.name,
                media.mediaReference(value.placementImageObjectKey),
                value.notes,
                value.status.name(),
                value.acknowledgedBy == null ? null : value.acknowledgedBy.id.toString(),
                value.acknowledgedBy == null ? null : value.acknowledgedBy.name,
                value.acknowledgedAt,
                value.acknowledgementNotes,
                reportedDamage,
                value.item.tracksRuntime,
                value.assetInstance != null ? value.assetInstance.operatingHours : value.item.currentOperatingHours,
                value.runtimeHours,
                runtimeEvent(value) == null ? null : runtimeEvent(value).name
        );
    }

    private static org.ash.inventory.operations.internal.model.EventOccurrence runtimeEvent(ReturnSubmission value) {
        return value.eventOccurrence != null ? value.eventOccurrence : value.order == null ? null : value.order.eventOccurrence;
    }

    public ApiResponses.AssemblyResponse assembly(Assembly value, List<org.ash.inventory.operations.internal.model.AssemblyItem> components,
            Map<UUID, ApiResponses.ItemResponse> componentViews) {
        var quantities = new LinkedHashMap<String, Integer>();
        var items = new ArrayList<ApiResponses.ItemResponse>();
        for (var component : components) {
            quantities.put(component.item.id.toString(), component.quantity);
            var view = componentViews.get(component.item.id);
            if (view != null) items.add(view);
        }
        return new ApiResponses.AssemblyResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.category,
                value.subcategory,
                value.description,
                value.hint,
                media.mediaReference(value.imageObjectKey),
                value.eventTags == null ? List.of() : value.eventTags,
                quantities.keySet(),
                quantities,
                Map.of("itemIds", items),
                accessPolicies.projection(value.accessPolicy)
        );
    }

    public ApiResponses.EventResponse event(EventOccurrence value, org.ash.inventory.operations.internal.application.EventMetricsService.Summary metrics) {
        return new ApiResponses.EventResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.eventType,
                value.name,
                value.startDate,
                value.startDate,
                value.endDate,
                value.status,
                value.notes,
                metrics.itemIds(),
                metrics.planned(),
                metrics.used(),
                metrics.itemNames(),
                metrics.quantities(), value.orderDeadline);
    }

    public ApiResponses.FactionResponse faction(Faction value) {
        return new ApiResponses.FactionResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.eventType,
                value.name,
                value.slug,
                value.active
        );
    }

    public ApiResponses.TransactionResponse transaction(StockTransaction value) {
        return transaction(value, value.assetInstance == null ? null : asset(value.assetInstance));
    }

    public List<ApiResponses.TransactionResponse> transactions(List<StockTransaction> values) {
        var assetViews = assets(values.stream().map(t -> t.assetInstance).filter(java.util.Objects::nonNull).distinct().toList())
                .stream().collect(java.util.stream.Collectors.toMap(ApiResponses.AssetInstanceResponse::id, java.util.function.Function.identity()));
        return values.stream().map(t -> transaction(t, t.assetInstance == null ? null : assetViews.get(t.assetInstance.id))).toList();
    }

    private ApiResponses.TransactionResponse transaction(StockTransaction value, ApiResponses.AssetInstanceResponse assetView) {
        var expand = new LinkedHashMap<String, Object>();
        var event = value.eventOccurrence != null ? value.eventOccurrence
                : value.order == null ? null : value.order.eventOccurrence;
        if (event != null) expand.put("eventOccurrence", Map.of("id", event.id, "name", event.name,
                "eventType", event.eventType, "startDate", event.startDate, "endDate", event.endDate));
        expand.put("userId", actor(value.user));
        if (value.assetInstance != null)
            expand.put("assetInstanceId", assetView);
        if (value.order != null) {
            expand.put("order", orderSummary(value.order));
        }
        return new ApiResponses.TransactionResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.item.id.toString(),
                value.item.name,
                value.user.id.toString(),
                value.type.name(),
                value.quantity,
                value.assetInstance == null ? null : value.assetInstance.id.toString(),
                value.sourceLocation == null ? null : value.sourceLocation.id.toString(),
                value.destinationLocation == null ? null : value.destinationLocation.id.toString(),
                value.availabilityBefore,
                value.availabilityAfter,
                value.order == null ? null : value.order.id.toString(),
                event == null ? null : event.id.toString(),
                value.eventType,
                value.faction,
                value.damageReport == null ? null : value.damageReport.id.toString(),
                value.clientCommandId == null ? null : value.clientCommandId.toString(),
                value.reason,
                value.notes,
                value.occurredAt,
                expand, value.reverses == null ? null : value.reverses.id, value.reversedBy == null ? null : actor(value.reversedBy)
        );
    }

    public ApiResponses.OrderResponse order(InventoryOrder value, List<OrderLine> lines,
            Map<AssemblyItemId, Integer> componentQuantities, List<ApiResponses.ItemResponse> itemViews,
            List<ApiResponses.AssemblyResponse> assemblyViews, List<ApiResponses.OrderHistoryResponse> history,
            Map<String, List<ApiResponses.AssetInstanceResponse>> assetAssignments, Map<String, Map<String, Integer>> sourceAllocations) {
        var orderLines = new ArrayList<ApiResponses.OrderLineResponse>();
        var quantities = OrderQuantities.from(lines, componentQuantities);
        var requested = quantities.requested();
        var prepared = quantities.prepared();
        var allocated = quantities.allocated();
        var reserved = quantities.reserved();
        var handedOver = quantities.handedOver();
        var returned = quantities.returned();
        var consumed = quantities.consumed();
        var missing = quantities.missing();
        var damaged = quantities.damaged();
        var writtenOff = quantities.writtenOff();
        var requestedAssemblies = quantities.requestedAssemblies();
        var preparedAssemblies = quantities.preparedAssemblies();
        for (var line : lines) {
            orderLines.add(new ApiResponses.OrderLineResponse(
                    line.id,
                    line.item.id,
                    line.item.name,
                    line.sourceAssembly == null ? null : line.sourceAssembly.id,
                    line.sourceAssembly == null ? null : line.sourceAssembly.name,
                    line.requestedQuantity,
                    line.preparedQuantity,
                    line.allocatedQuantity,
                    line.reservedQuantity,
                    line.handedOverQuantity,
                    line.returnedQuantity,
                    line.consumedQuantity,
                    line.missingQuantity,
                    line.damagedQuantity,
                    line.writtenOffQuantity
            ));

        }

        var expand = new LinkedHashMap<String, Object>();
        expand.put("itemIds", itemViews);
        expand.put("assemblyIds", assemblyViews);
        if (value.createdBy != null)
            expand.put("createdBy", actor(value.createdBy));
        if (value.preparedBy != null)
            expand.put("preparedBy", actor(value.preparedBy));
        if (value.readyBy != null)
            expand.put("readyBy", actor(value.readyBy));
        if (value.pickedUpBy != null)
            expand.put("pickedUpBy", actor(value.pickedUpBy));
        if (value.returnedBy != null)
            expand.put("returnedBy", actor(value.returnedBy));
        if (value.pickupLocation != null)
            expand.put("pickupLocation", location(value.pickupLocation));

        return new ApiResponses.OrderResponse(
                value.kind.name(),
                value.id,
                value.createdAt,
                value.updatedAt,
                value.orderCode,
                value.eventOccurrence.eventType,
                value.eventOccurrence.id,
                value.eventOccurrence.startDate,
                value.requestedPickupDate,
                value.faction.name,
                value.faction.id,
                org.ash.inventory.operations.internal.security.ActorService.factionKey(value.faction.eventType, value.faction.slug),
                value.status.name(),
                value.pickupLocation == null ? null : value.pickupLocation.id.toString(),
                value.pickupLatitude,
                value.pickupLongitude,
                value.collectorName,
                value.notes,
                value.createdBy == null ? null : value.createdBy.id.toString(),
                value.preparedBy == null ? null : value.preparedBy.id.toString(),
                value.readyBy == null ? null : value.readyBy.id.toString(),
                value.pickedUpBy == null ? null : value.pickedUpBy.id.toString(),
                value.returnedBy == null ? null : value.returnedBy.id.toString(),
                requested.keySet(),
                requested,
                prepared,
                allocated,
                reserved,
                handedOver,
                returned,
                consumed,
                missing,
                damaged,
                writtenOff,
                requestedAssemblies.keySet(),
                requestedAssemblies,
                preparedAssemblies,
                assetAssignments,
                orderLines,
                history,
                itemRequests(value),
                expand,
                sourceAllocations
        );
    }

    public ApiResponses.OrderSummaryResponse orderSummary(InventoryOrder value, List<OrderLine> lines,
            Map<AssemblyItemId, Integer> componentQuantities) {
        var quantities = OrderQuantities.from(lines, componentQuantities);
        var requested = quantities.requested();
        var prepared = quantities.prepared();
        var allocated = quantities.allocated();
        var reserved = quantities.reserved();
        var handedOver = quantities.handedOver();
        var returned = quantities.returned();
        var consumed = quantities.consumed();
        var missing = quantities.missing();
        var damaged = quantities.damaged();
        var writtenOff = quantities.writtenOff();
        var requestedAssemblies = quantities.requestedAssemblies();
        var preparedAssemblies = quantities.preparedAssemblies();

        Map<String, Object> expand = value.pickupLocation == null
                ? Map.of()
                : Map.of("pickupLocation", location(value.pickupLocation));
        return new ApiResponses.OrderSummaryResponse(
                value.kind.name(),
                value.id, value.createdAt, value.updatedAt, value.orderCode,
                value.eventOccurrence.eventType, value.eventOccurrence.id, value.eventOccurrence.startDate,
                value.requestedPickupDate, value.faction.name, value.faction.id,
                org.ash.inventory.operations.internal.security.ActorService.factionKey(value.faction.eventType, value.faction.slug), value.status.name(),
                value.pickupLocation == null ? null : value.pickupLocation.id.toString(),
                value.pickupLatitude, value.pickupLongitude, value.collectorName, value.notes,
                requested.keySet(), requested, prepared, allocated, reserved, handedOver, returned, consumed,
                missing, damaged, writtenOff, requestedAssemblies.keySet(), requestedAssemblies,
                preparedAssemblies, itemRequests(value), expand);
    }

    public List<ApiResponses.OrderItemRequestResponse> itemRequests(InventoryOrder value) {
        return value.itemRequests.stream().map(this::itemRequest).toList();
    }

    public ApiResponses.OrderItemRequestResponse itemRequest(OrderItemRequest value) {
        boolean itemVisible = value.item != null && accessPolicies.projectionAllows(value.item.accessPolicy);
        var purchase = value.purchaseOrder;
        return new ApiResponses.OrderItemRequestResponse(value.id, value.name, value.quantity, value.link, value.note,
                value.status().name(), itemVisible ? value.item.id : null, itemVisible ? value.item.name : null,
                purchase == null ? null : purchase.id, purchase == null ? null : purchase.orderNumber,
                purchase == null ? null : purchase.status.name(), value.declineReason,
                value.resolvedBy == null ? null : value.resolvedBy.name, value.declinedAt);
    }

    public ApiResponses.ItemRequestQueueEntry itemRequestQueueEntry(OrderItemRequest value) {
        var order = value.order;
        var event = order.eventOccurrence;
        return new ApiResponses.ItemRequestQueueEntry(itemRequest(value), order.id, order.kind.name(), order.label(),
                order.status.name(), order.faction == null ? null : order.faction.name,
                event == null ? null : event.id, event == null ? null : event.name, event == null ? null : event.startDate,
                order.createdBy.name);
    }

    public ApiResponses.DamageResponse damage(DamageReport value) {
        var expand = new LinkedHashMap<String, Object>();
        expand.put("reportedBy", actor(value.reporter));
        if (value.handler != null)
            expand.put("handledBy", actor(value.handler));

        return new ApiResponses.DamageResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.item == null ? null : value.item.id.toString(),
                value.item == null ? null : value.item.name,
                value.assembly == null ? null : value.assembly.id.toString(),
                value.assembly == null ? null : value.assembly.name,
                value.quantity,
                value.repairedQuantity,
                value.writtenOffQuantity,
                value.reporter.id.toString(),
                value.handler == null ? null : value.handler.id.toString(),
                value.order == null ? null : value.order.id.toString(),
                value.description,
                value.severity.name(),
                value.status.name(),
                value.createdAt,
                value.assetInstance == null ? null : value.assetInstance.id.toString(),
                value.assetInstance == null ? null : value.assetInstance.assetCode,
                value.handover == null ? null : value.handover.id.toString(),
                value.safetyImpact,
                value.resolutionNotes,
                expand
        );
    }

    public ApiResponses.MaintenanceResponse maintenance(MaintenanceRecord value) {
        return new ApiResponses.MaintenanceResponse(
                value.id,
                value.item.id.toString(),
                value.item.name,
                value.type.name(),
                value.inspector.id.toString(),
                value.performedAt,
                value.nextDueAt,
                value.operatingHours,
                value.result.name(),
                value.certificateNumber,
                value.certificateObjectKey,
                value.notes,
                value.createdAt,
                value.assetInstance == null ? null : value.assetInstance.id.toString(),
                value.schedule == null ? null : value.schedule.id.toString()
        );
    }

    public ApiResponses.NotificationResponse notification(NotificationService.Notice value) {
        return new ApiResponses.NotificationResponse(value.id(), value.type(), value.payload(), value.createdAt(), value.readAt(), value.orderId());
    }

    public ApiResponses.OrderHistoryResponse history(OrderHistory value) {
        return new ApiResponses.OrderHistoryResponse(
                value.id.toString(),
                value.action,
                value.actor.id.toString(),
                value.actor.name,
                value.occurredAt,
                value.fromStatus,
                value.toStatus,
                value.deltaSnapshot,
                value.notes
        );
    }

    public Map<String, Object> orderSummary(InventoryOrder value) {
        var result = new LinkedHashMap<String, Object>();
        result.put("id", value.id.toString());
        result.put("kind", value.kind.name());
        result.put("orderCode", value.label());
        if (value.eventOccurrence != null) {
            result.put("eventType", value.eventOccurrence.eventType);
            result.put("eventOccurrenceId", value.eventOccurrence.id.toString());
            result.put("eventDate", value.eventOccurrence.startDate);
        }
        if (value.requestedPickupDate != null)
            result.put("requestedPickupDate", value.requestedPickupDate);
        result.put("faction", value.factionLabel());
        if (value.faction != null) result.put("factionId", value.faction.id.toString());
        result.put("status", value.status.name());
        return result;
    }

    private static java.math.BigDecimal cents(Integer value) {
        return value == null ? null : java.math.BigDecimal.valueOf(value, 2);
    }

    public ApiResponses.RuntimeEntryResponse runtime(org.ash.inventory.operations.internal.model.RuntimeEntry value) {
        var event = value.eventOccurrence;
        return new ApiResponses.RuntimeEntryResponse(value.id, value.item.id,
                value.assetInstance == null ? null : value.assetInstance.id,
                value.assetInstance == null ? null : value.assetInstance.assetCode,
                event == null ? null : event.id, event == null ? null : event.name, event == null ? null : event.startDate,
                value.order == null ? null : value.order.id, value.order == null ? null : value.order.label(),
                value.hours, value.readingAfter, value.source.name(), value.recordedAt,
                value.recordedBy == null ? null : value.recordedBy.name, value.notes);
    }

    /** Resolves the holder of a reserved or staged asset, like the list projection. */
    public ApiResponses.AssetInstanceResponse asset(AssetInstance value) { return assets(List.of(value)).getFirst(); }

    private ApiResponses.AssetInstanceResponse asset(AssetInstance value, org.ash.inventory.operations.internal.persistence.AssetReservationOrm.Holder holder) {
        return new ApiResponses.AssetInstanceResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.item.id,
                value.assetCode,
                value.serialNumber,
                value.manufacturer,
                value.model,
                value.purchaseDate,
                cents(value.purchasePriceCents),
                cents(value.replacementValueCents),
                value.conditionStatus == null ? "good" : value.conditionStatus.name(),
                value.availabilityStatus == null ? "available" : value.availabilityStatus.name(),
                maintenance.status(value.item, value),
                maintenance.due(value.item, value),
                value.operatingHours,
                canViewLocation(value.currentLocation) ? value.currentLocation.id.toString() : null,
                canViewLocation(value.currentLocation) ? visibleLocationCode(value.currentLocation) : null,
                canViewLocation(value.currentLocation) ? locationPath(value.currentLocation) : null,
                value.currentCustodian == null ? null : value.currentCustodian.id.toString(),
                value.currentCustodian == null ? null : value.currentCustodian.name,
                value.notes,
                value.active,
                value.version,
                holder == null ? null : new ApiResponses.AssetReservationResponse(holder.kind(), holder.orderId(), holder.label())
        );
    }

    /**
     * Asset projections also say which order holds each reserved or staged asset. A holder order hidden from the
     * actor (e.g. it references another user's private item) keeps only a restricted indicator, so REST and MCP agree.
     */
    public List<ApiResponses.AssetInstanceResponse> assets(List<AssetInstance> values) {
        maintenance.prepare(values.stream().map(a -> a.item).distinct().toList());
        prepareLocations(values.stream().map(a -> a.currentLocation).toList());
        var holders = assetReservations.holders(values.stream()
                .filter(a -> a.availabilityStatus == DomainEnums.AssetState.reserved || a.availabilityStatus == DomainEnums.AssetState.staged)
                .map(a -> a.id).toList());
        var denied = privacy.deniedAmong(holders.values().stream().map(org.ash.inventory.operations.internal.persistence.AssetReservationOrm.Holder::orderId)
                .collect(java.util.stream.Collectors.toSet()));
        return values.stream().map(a -> {
            var holder = holders.get(a.id);
            if (holder != null && denied.contains(holder.orderId()))
                holder = new org.ash.inventory.operations.internal.persistence.AssetReservationOrm.Holder(holder.kind(), null, "restricted");
            return asset(a, holder);
        }).toList();
    }

    public ApiResponses.OutboxEventResponse outboxEvent(DomainEventService.EventView value) {
        return new ApiResponses.OutboxEventResponse(
                value.id(), value.eventId(), value.eventType(), value.aggregateType(), value.aggregateId(),
                value.actorId(), value.idempotencyKey(), value.occurredAt(), value.status(),
                value.attemptCount(), value.availableAt(), value.publishedAt(), value.lastError(), Map.copyOf(value.payload()));
    }

    public ApiResponses.SyncAuditResponse syncAudit(SyncCommandAudit value) {
        return new ApiResponses.SyncAuditResponse(value.id, value.commandId, value.supersedes, value.resolutionNote, value.user.id, value.deviceId,
                value.operationType, new LinkedHashMap<>(value.payload), value.localTimestamp, value.syncStatus,
                value.retryCount, value.serverResult == null ? null : new LinkedHashMap<>(value.serverResult),
                value.conflictMessage, value.createdAt, value.updatedAt);
    }
}
