package org.ash.inventory.resource;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.helper.storage.MediaService;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItemId;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEvent;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderHistory;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.GeneralOrder;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.Notification;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.SyncCommandAudit;
import org.ash.inventory.model.StorageLocation;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.CatalogOrm;
import org.ash.inventory.orm.OrderOrm;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.InventoryOperationsService;
import org.ash.inventory.service.OrderQuantities;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class ApiMapper {
    private final MediaService media;
    private final CatalogOrm catalogOrm;
    private final OrderOrm orderOrm;
    private final InventoryOperationsService operations;

    public ApiMapper(MediaService media, CatalogOrm catalogOrm, OrderOrm orderOrm,
            InventoryOperationsService operations) {
        this.media = media;
        this.catalogOrm = catalogOrm;
        this.orderOrm = orderOrm;
        this.operations = operations;
    }

    public ApiResponses.UserResponse user(UserAccount value) {
        return new ApiResponses.UserResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.name,
                value.email,
                value.role.name(),
                value.factions == null ? List.of() : value.factions
        );
    }

    public ApiResponses.GeneralOrderResponse generalOrder(GeneralOrder value) {
        return new ApiResponses.GeneralOrderResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.purpose,
                value.createdBy.id.toString(),
                Map.of("createdBy", user(value.createdBy))
        );
    }

    public ApiResponses.StorageLocationResponse location(StorageLocation value) {
        return new ApiResponses.StorageLocationResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.locationType == null ? DomainEnums.LocationType.bin.name() : value.locationType.name(),
                value.description,
                value.area,
                value.location,
                value.position,
                value.latitude,
                value.longitude,
                value.mapZoom,
                media.mediaReference(value.mapOverlayUrl),
                value.overlayBounds,
                value.warehouse == null ? null : value.warehouse.id.toString(),
                value.warehouse == null ? null : value.warehouse.name,
                value.active
        );
    }

    public ApiResponses.ItemResponse item(Item value) {
        return item(value, operations.stock(value));
    }

    public List<ApiResponses.ItemResponse> items(List<Item> values) {
        var stock = operations.stock(values);
        return values.stream().map(value -> item(value, stock.get(value.id))).toList();
    }

    private ApiResponses.ItemResponse item(Item value, InventoryOperationsService.StockState state) {
        var images = catalogOrm.itemImages(value).stream()
                .map(image -> media.mediaReference(image.objectKey))
                .toList();
        Map<String, Object> expand = value.storageLocation != null
                ? Map.of("storageLocation", location(value.storageLocation))
                : Map.of();

        ApiResponses.StockDto stockDto = state == null ? null : new ApiResponses.StockDto(
                state.totalOwned(),
                state.onHand(),
                state.checkedOut(),
                state.damaged(),
                state.reserved(),
                state.available()
        );

        return new ApiResponses.ItemResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.sku,
                value.name,
                value.description,
                value.baseAmount,
                value.minStock,
                BigDecimal.valueOf(value.unitValueCents, 2),
                value.category,
                value.subcategory,
                value.supplier,
                value.eventTags == null ? List.of() : value.eventTags,
                value.consumable,
                value.trackingMode.name(),
                value.inventoryRole.name(),
                value.storageLocation == null ? null : value.storageLocation.id.toString(),
                value.active ? "available" : "retired",
                images,
                value.hint,
                value.positionDetails,
                value.containerSize,
                value.containerCount,
                value.containersOpened,
                value.containerRemainingPercent,
                value.maintenanceIntervalDays,
                value.nextMaintenanceDue,
                value.currentOperatingHours,
                value.maintenanceStatus == null ? null : value.maintenanceStatus.name(),
                stockDto,
                expand
        );
    }

    public ApiResponses.AssemblyResponse assembly(Assembly value) {
        var components = catalogOrm.assemblyItems(value);
        var quantities = new LinkedHashMap<String, Integer>();
        var items = new ArrayList<ApiResponses.ItemResponse>();
        for (var component : components) {
            quantities.put(component.item.id.toString(), component.quantity);
            items.add(item(component.item, null));
        }
        return new ApiResponses.AssemblyResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.description,
                value.hint,
                media.mediaReference(value.imageObjectKey),
                value.eventTags == null ? List.of() : value.eventTags,
                quantities.keySet(),
                quantities,
                Map.of("itemIds", items)
        );
    }

    public ApiResponses.EventResponse event(EventOccurrence value) {
        var planned = value.plannedQuantities == null ? Map.<String, Integer>of() : value.plannedQuantities;
        var used = value.usedQuantities == null ? Map.<String, Integer>of() : value.usedQuantities;
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
                used.keySet().stream().filter(id -> used.getOrDefault(id, 0) > 0).toList(),
                planned,
                used
        );
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
        var expand = new LinkedHashMap<String, Object>();
        expand.put("userId", user(value.user));
        if (value.assetInstance != null)
            expand.put("assetInstanceId", asset(value.assetInstance));
        if (value.factionOrder != null) {
            expand.put("factionOrderId", orderSummary(value.factionOrder));
        }
        return new ApiResponses.TransactionResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.item.id.toString(),
                value.user.id.toString(),
                value.type.name(),
                value.quantity,
                value.assetInstance == null ? null : value.assetInstance.id.toString(),
                value.sourceLocation == null ? null : value.sourceLocation.id.toString(),
                value.destinationLocation == null ? null : value.destinationLocation.id.toString(),
                value.availabilityBefore,
                value.availabilityAfter,
                value.factionOrder == null ? null : value.factionOrder.id.toString(),
                value.eventType,
                value.faction,
                value.damageReport == null ? null : value.damageReport.id.toString(),
                value.clientCommandId == null ? null : value.clientCommandId.toString(),
                value.reason,
                value.notes,
                value.occurredAt,
                expand
        );
    }

    public ApiResponses.OrderResponse order(FactionOrder value) {
        var assemblyViews = new ArrayList<ApiResponses.AssemblyResponse>();
        var itemViews = new ArrayList<ApiResponses.ItemResponse>();
        var orderLines = new ArrayList<ApiResponses.OrderLineResponse>();
        var assetAssignments = new LinkedHashMap<String, List<ApiResponses.AssetInstanceResponse>>();

        var lines = orderOrm.lines(value);
        var assemblyIds = lines.stream().filter(line -> line.sourceAssembly != null)
                .map(line -> line.sourceAssembly.id).distinct().toList();
        var componentQuantities = new LinkedHashMap<AssemblyItemId, Integer>();
        for (var component : orderOrm.assemblyItems(assemblyIds)) componentQuantities.put(component.id, component.quantity);
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

            if (itemViews.stream().noneMatch(existing -> line.item.id.equals(existing.id())))
                itemViews.add(item(line.item));
            if (line.sourceAssembly != null && assemblyViews.stream()
                    .noneMatch(existing -> line.sourceAssembly.id.equals(existing.id()))) {
                assemblyViews.add(assembly(line.sourceAssembly));
            }
        }

        var history = orderOrm.history(value).stream().map(this::history).toList();
        for (var assignment : orderOrm.assetAssignments(value)) {
            assetAssignments.computeIfAbsent(assignment.assetInstance.item.id.toString(), ignored -> new ArrayList<>())
                    .add(asset(assignment.assetInstance));
        }

        var expand = new LinkedHashMap<String, Object>();
        expand.put("itemIds", itemViews);
        expand.put("assemblyIds", assemblyViews);
        if (value.createdBy != null)
            expand.put("createdBy", user(value.createdBy));
        if (value.preparedBy != null)
            expand.put("preparedBy", user(value.preparedBy));
        if (value.readyBy != null)
            expand.put("readyBy", user(value.readyBy));
        if (value.pickedUpBy != null)
            expand.put("pickedUpBy", user(value.pickedUpBy));
        if (value.returnedBy != null)
            expand.put("returnedBy", user(value.returnedBy));
        if (value.pickupLocation != null)
            expand.put("pickupLocation", location(value.pickupLocation));

        return new ApiResponses.OrderResponse(
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
                value.faction.eventType + ":" + value.faction.name,
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
                expand
        );
    }

    public ApiResponses.OrderSummaryResponse orderSummary(FactionOrder value, List<FactionOrderLine> lines,
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
                value.id, value.createdAt, value.updatedAt, value.orderCode,
                value.eventOccurrence.eventType, value.eventOccurrence.id, value.eventOccurrence.startDate,
                value.requestedPickupDate, value.faction.name, value.faction.id,
                value.faction.eventType + ":" + value.faction.name, value.status.name(),
                value.pickupLocation == null ? null : value.pickupLocation.id.toString(),
                value.pickupLatitude, value.pickupLongitude, value.collectorName, value.notes,
                requested.keySet(), requested, prepared, allocated, reserved, handedOver, returned, consumed,
                missing, damaged, writtenOff, requestedAssemblies.keySet(), requestedAssemblies,
                preparedAssemblies, expand);
    }

    public ApiResponses.DamageResponse damage(DamageReport value) {
        var expand = new LinkedHashMap<String, Object>();
        expand.put("reportedBy", user(value.reporter));
        if (value.handler != null)
            expand.put("handledBy", user(value.handler));

        return new ApiResponses.DamageResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.item == null ? null : value.item.id.toString(),
                value.assembly == null ? null : value.assembly.id.toString(),
                value.assembly == null ? null : value.assembly.name,
                value.quantity,
                value.repairedQuantity,
                value.writtenOffQuantity,
                value.reporter.id.toString(),
                value.handler == null ? null : value.handler.id.toString(),
                value.factionOrder == null ? null : value.factionOrder.id.toString(),
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

    public ApiResponses.NotificationResponse notification(Notification value) {
        return new ApiResponses.NotificationResponse(
                value.id,
                value.type,
                value.payload,
                value.createdAt,
                value.readAt,
                value.factionOrder == null ? null : value.factionOrder.id);
    }

    public ApiResponses.DeficitResponse deficit(InventoryOperationsService.Deficit value) {
        return new ApiResponses.DeficitResponse(
                value.itemId(), value.sku(), value.name(), value.category(), value.supplier(), value.classification(),
                value.demand(), value.onHandStock(), value.totalOwnedStock(), value.availableStock(),
                value.reservedStock(), value.projectedStock(), value.netDeficit(), value.recommendedAction());
    }

    public ApiResponses.OrderHistoryResponse history(FactionOrderHistory value) {
        return new ApiResponses.OrderHistoryResponse(
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

    public Map<String, Object> orderSummary(FactionOrder value) {
        var result = new LinkedHashMap<String, Object>();
        result.put("id", value.id.toString());
        result.put("orderCode", value.orderCode);
        result.put("eventType", value.eventOccurrence.eventType);
        result.put("eventOccurrenceId", value.eventOccurrence.id.toString());
        result.put("eventDate", value.eventOccurrence.startDate);
        if (value.requestedPickupDate != null)
            result.put("requestedPickupDate", value.requestedPickupDate);
        result.put("faction", value.faction.name);
        result.put("factionId", value.faction.id.toString());
        result.put("status", value.status.name());
        return result;
    }

    public ApiResponses.AssetInstanceResponse asset(AssetInstance value) {
        return new ApiResponses.AssetInstanceResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.item.id,
                value.assetCode,
                value.serialNumber,
                value.manufacturer,
                value.model,
                value.conditionStatus == null ? "good" : value.conditionStatus.name(),
                value.availabilityStatus == null ? "available" : value.availabilityStatus.name(),
                value.serviceStatus == null ? null : value.serviceStatus.name(),
                value.operatingHours,
                value.currentLocation == null ? null : value.currentLocation.id.toString(),
                value.currentLocation == null ? null : value.currentLocation.name,
                value.currentCustodian == null ? null : value.currentCustodian.id.toString(),
                value.currentCustodian == null ? null : value.currentCustodian.name,
                value.notes,
                value.active,
                value.version
        );
    }

    public List<ApiResponses.AssetInstanceResponse> assets(List<AssetInstance> values) {
        return values.stream().map(this::asset).toList();
    }

    public ApiResponses.OutboxEventResponse outboxEvent(DomainEvent value) {
        return new ApiResponses.OutboxEventResponse(
                value.id, value.eventId, value.eventType, value.aggregateType, value.aggregateId,
                value.actorId, value.idempotencyKey, value.occurredAt, value.status.name(),
                value.attemptCount, value.availableAt, value.publishedAt, value.lastError, Map.copyOf(value.payload));
    }

    public ApiResponses.SyncAuditResponse syncAudit(SyncCommandAudit value) {
        return new ApiResponses.SyncAuditResponse(value.id, value.commandId, value.user.id, value.deviceId,
                value.operationType, new LinkedHashMap<>(value.payload), value.localTimestamp, value.syncStatus,
                value.retryCount, value.serverResult == null ? null : new LinkedHashMap<>(value.serverResult),
                value.conflictMessage, value.createdAt, value.updatedAt);
    }
}
