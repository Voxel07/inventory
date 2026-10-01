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
import org.ash.inventory.model.ReturnSubmission;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.SyncCommandAudit;
import org.ash.inventory.model.StorageLocation;
import org.ash.inventory.model.UserAccount;
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
    @jakarta.inject.Inject org.ash.inventory.helper.security.ActorService actors;
    @jakarta.inject.Inject org.ash.inventory.service.InventoryAccessService accessPolicies;
    private final MediaService media;
    public ApiMapper(MediaService media) { this.media = media; }

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

    public ApiResponses.GeneralOrderResponse generalOrder(GeneralOrder value, Map<String, String> itemNames,
            List<org.ash.inventory.model.GeneralOrderHistory> history) {
        return new ApiResponses.GeneralOrderResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.purpose,
                value.createdBy.id.toString(),
                value.eventOccurrence == null ? null : value.eventOccurrence.id.toString(),
                value.status,
                value.requestedQuantities,
                value.handedOverQuantities,
                value.returnedQuantities,
                value.consumedQuantities,
                value.assetAssignments,
                itemNames,
                value.preparedQuantities,
                value.damagedQuantities,
                value.missingQuantities,
                value.writtenOffQuantities,
                value.reconciledAssets,
                history.stream().map(h -> {
                            var row = new LinkedHashMap<String, Object>();
                            row.put("id", h.id); row.put("actorName", h.actor.name); row.put("actorId", h.actor.id);
                            row.put("timestamp", h.occurredAt); row.put("action", h.action); row.put("notes", h.notes); row.put("delta", h.delta);
                            return (Map<String, Object>) row;
                        }).toList(),
                Map.of("createdBy", user(value.createdBy)), value.sourceLocations
        );
    }

    public ApiResponses.GeneralOrderSummaryResponse generalOrderSummary(GeneralOrder value, Map<String, String> itemNames) {
        return new ApiResponses.GeneralOrderSummaryResponse(
                value.id,
                value.createdAt,
                value.updatedAt,
                value.name,
                value.purpose,
                value.createdBy.id.toString(),
                value.eventOccurrence == null ? null : value.eventOccurrence.id.toString(),
                value.status,
                value.requestedQuantities,
                value.handedOverQuantities,
                value.returnedQuantities,
                value.consumedQuantities,
                value.assetAssignments,
                itemNames,
                value.preparedQuantities,
                value.damagedQuantities,
                value.missingQuantities,
                value.writtenOffQuantities,
                value.reconciledAssets,
                Map.of("createdBy", user(value.createdBy)), value.sourceLocations
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
                actors.canViewLocation(value.parent) ? value.parent.id.toString() : null,
                value.active, accessPolicies.view(value.accessPolicy)
        );
    }

    public ApiResponses.ItemResponse item(Item value, InventoryOperationsService.StockState state,
            List<org.ash.inventory.model.ItemImage> images, int ordered) {
        var imageReferences = images.stream()
                .map(image -> media.mediaReference(image.objectKey))
                .toList();
        Map<String, Object> expand = new LinkedHashMap<>();
        if (actors.canViewLocation(value.storageLocation)) expand.put("storageLocation", location(value.storageLocation));
        if (actors.canViewLocation(value.returnLocation)) expand.put("returnLocation", location(value.returnLocation));
        if (value.assignedUser != null) expand.put("assignedUser", user(value.assignedUser));

        ApiResponses.StockDto stockDto = state == null ? null : new ApiResponses.StockDto(
                value.accessPolicy != null || value.ownershipType == Item.Ownership.organization ? state.totalOwned() : 0,
                state.onHand(),
                state.checkedOut(),
                state.inTransit(),
                state.damaged(),
                state.reserved(),
                state.available(),
                ordered
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
                value.visibilityScope == null ? DomainEnums.ItemVisibilityScope.global.name() : value.visibilityScope.name(),
                value.assignedUser == null ? null : value.assignedUser.id.toString(),
                value.assignedUser == null ? null : value.assignedUser.name,
                value.assignedGroup,
                value.eventTags == null ? List.of() : value.eventTags,
                value.consumable,
                value.trackingMode.name(),
                value.inventoryRole.name(),
                actors.canViewLocation(value.storageLocation) ? value.storageLocation.id.toString() : null,
                actors.canViewLocation(value.returnLocation) ? value.returnLocation.id.toString() : null,
                value.active ? "available" : "retired",
                imageReferences,
                value.hint,
                actors.canViewLocation(value.storageLocation) ? value.positionDetails : null,
                value.containerSize,
                value.containerCount,
                value.containersOpened,
                value.containerRemainingPercent,
                value.maintenanceIntervalDays,
                value.nextMaintenanceDue,
                value.currentOperatingHours,
                value.fuelConsumptionLitersPer100Km,
                value.batteryReplacementDue,
                value.bestBeforeDate,
                value.maintenanceStatus == null ? null : value.maintenanceStatus.name(),
                stockDto,
                expand, accessPolicies.view(value.accessPolicy), !actors.canViewLocation(value.storageLocation) && value.storageLocation != null
        );
    }

    public ApiResponses.ReturnSubmissionResponse returnSubmission(ReturnSubmission value) {
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
                value.factionOrder == null ? null : value.factionOrder.id.toString(),
                value.expectedReturnLocation == null ? null : value.expectedReturnLocation.id.toString(),
                value.expectedReturnLocation == null ? null : value.expectedReturnLocation.name,
                media.mediaReference(value.placementImageObjectKey),
                value.notes,
                value.status.name(),
                value.acknowledgedBy == null ? null : value.acknowledgedBy.id.toString(),
                value.acknowledgedBy == null ? null : value.acknowledgedBy.name,
                value.acknowledgedAt,
                value.acknowledgementNotes
        );
    }

    public ApiResponses.AssemblyResponse assembly(Assembly value, List<org.ash.inventory.model.AssemblyItem> components,
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
                value.description,
                value.hint,
                media.mediaReference(value.imageObjectKey),
                value.eventTags == null ? List.of() : value.eventTags,
                quantities.keySet(),
                quantities,
                Map.of("itemIds", items)
        );
    }

    public ApiResponses.EventResponse event(EventOccurrence value, org.ash.inventory.service.EventMetricsService.Summary metrics) {
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
                metrics.quantities()
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

    public ApiResponses.OrderResponse order(FactionOrder value, List<FactionOrderLine> lines,
            Map<AssemblyItemId, Integer> componentQuantities, List<ApiResponses.ItemResponse> itemViews,
            List<ApiResponses.AssemblyResponse> assemblyViews, List<ApiResponses.OrderHistoryResponse> history,
            Map<String, List<ApiResponses.AssetInstanceResponse>> assetAssignments, Map<String, String> sourceLocations) {
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
                expand,
                sourceLocations
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
                actors.canViewLocation(value.currentLocation) ? value.currentLocation.id.toString() : null,
                actors.canViewLocation(value.currentLocation) ? value.currentLocation.name : null,
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
        return new ApiResponses.SyncAuditResponse(value.id, value.commandId, value.supersedes, value.resolutionNote, value.user.id, value.deviceId,
                value.operationType, new LinkedHashMap<>(value.payload), value.localTimestamp, value.syncStatus,
                value.retryCount, value.serverResult == null ? null : new LinkedHashMap<>(value.serverResult),
                value.conflictMessage, value.createdAt, value.updatedAt);
    }
}
