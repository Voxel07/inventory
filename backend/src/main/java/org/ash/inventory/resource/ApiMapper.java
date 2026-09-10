package org.ash.inventory.resource;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.helper.storage.MediaService;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderHistory;
import org.ash.inventory.model.GeneralOrder;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.StorageLocation;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.CatalogOrm;
import org.ash.inventory.orm.OrderOrm;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.InventoryOperationsService;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@ApplicationScoped
public class ApiMapper {
    @Inject
    MediaService media;
    @Inject
    CatalogOrm catalogOrm;
    @Inject
    OrderOrm orderOrm;
    @Inject
    InventoryOperationsService operations;

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
                value.overlayBounds
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
                List.of(),
                Map.of(),
                Map.of()
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
                value.damageReport == null ? null : value.damageReport.id.toString(),
                value.clientCommandId == null ? null : value.clientCommandId.toString(),
                value.reason,
                value.notes,
                value.occurredAt,
                expand
        );
    }

    public ApiResponses.OrderResponse order(FactionOrder value) {
        var requested = new LinkedHashMap<String, Integer>();
        var prepared = new LinkedHashMap<String, Integer>();
        var allocated = new LinkedHashMap<String, Integer>();
        var reserved = new LinkedHashMap<String, Integer>();
        var handedOver = new LinkedHashMap<String, Integer>();
        var returned = new LinkedHashMap<String, Integer>();
        var consumed = new LinkedHashMap<String, Integer>();
        var missing = new LinkedHashMap<String, Integer>();
        var damaged = new LinkedHashMap<String, Integer>();
        var writtenOff = new LinkedHashMap<String, Integer>();
        var requestedAssemblies = new LinkedHashMap<String, Integer>();
        var preparedAssemblies = new LinkedHashMap<String, Integer>();
        var assemblyViews = new ArrayList<ApiResponses.AssemblyResponse>();
        var itemViews = new ArrayList<ApiResponses.ItemResponse>();
        var orderLines = new ArrayList<ApiResponses.OrderLineResponse>();

        var lines = orderOrm.lines(value);
        for (var line : lines) {
            String id = line.item.id.toString();
            if (line.sourceAssembly == null) {
                requested.merge(id, line.requestedQuantity, Integer::sum);
                prepared.merge(id, line.preparedQuantity, Integer::sum);
            }
            allocated.merge(id, line.allocatedQuantity, Integer::sum);
            reserved.merge(id, line.reservedQuantity, Integer::sum);
            handedOver.merge(id, line.handedOverQuantity, Integer::sum);
            returned.merge(id, line.returnedQuantity, Integer::sum);
            consumed.merge(id, line.consumedQuantity, Integer::sum);
            missing.merge(id, line.missingQuantity, Integer::sum);
            damaged.merge(id, line.damagedQuantity, Integer::sum);
            writtenOff.merge(id, line.writtenOffQuantity, Integer::sum);

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

        for (var assemblyView : assemblyViews) {
            String assemblyId = assemblyView.id().toString();
            var assemblyLines = lines.stream()
                    .filter(line -> line.sourceAssembly != null && line.sourceAssembly.id.toString().equals(assemblyId))
                    .toList();
            int requestedCount = Integer.MAX_VALUE;
            int preparedCount = Integer.MAX_VALUE;
            for (var line : assemblyLines) {
                var component = orderOrm.assemblyItem(line.sourceAssembly, line.item);
                int componentQuantity = component == null ? 1 : component.quantity;
                requestedCount = Math.min(requestedCount, line.requestedQuantity / componentQuantity);
                preparedCount = Math.min(preparedCount, line.preparedQuantity / componentQuantity);
            }
            requestedAssemblies.put(assemblyId, requestedCount == Integer.MAX_VALUE ? 0 : requestedCount);
            preparedAssemblies.put(assemblyId, preparedCount == Integer.MAX_VALUE ? 0 : preparedCount);
        }

        var history = orderOrm.history(value).stream().map(this::history).toList();

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
                orderLines,
                history,
                expand
        );
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
                value.item.id.toString(),
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
                value.notes,
                value.createdAt
        );
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
}
