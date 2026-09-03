package org.ash.inventory.resource;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.orm.CatalogOrm;
import org.ash.inventory.orm.OrderOrm;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItem;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.FactionOrderHistory;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.GeneralOrder;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.ItemImage;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.StorageLocation;
import org.ash.inventory.model.UserAccount;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@ApplicationScoped
public class ApiMapper {
    @Inject CatalogOrm catalogOrm;
    @Inject OrderOrm orderOrm;

    public Map<String, Object> user(UserAccount value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        put(result, "name", value.name);
        put(result, "username", value.name);
        put(result, "email", value.email);
        put(result, "role", value.role.name());
        result.put("faction", value.factions == null ? List.of() : value.factions);
        return result;
    }

    public Map<String, Object> generalOrder(GeneralOrder value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        result.put("name", value.name);
        result.put("purpose", value.purpose);
        result.put("createdBy", value.createdBy.id.toString());
        result.put("expand", Map.of("createdBy", user(value.createdBy)));
        return result;
    }

    public Map<String, Object> location(StorageLocation value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        put(result, "name", value.name);
        put(result, "description", value.description);
        put(result, "area", value.area);
        put(result, "location", value.location);
        put(result, "position", value.position);
        put(result, "latitude", value.latitude);
        put(result, "longitude", value.longitude);
        put(result, "mapZoom", value.mapZoom);
        put(result, "mapOverlay", value.mapOverlayUrl);
        put(result, "overlayBounds", value.overlayBounds);
        return result;
    }

    public Map<String, Object> item(Item value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        result.put("sku", value.sku);
        result.put("name", value.name);
        put(result, "description", value.description);
        result.put("amount", value.baseAmount);
        result.put("minStock", value.minStock);
        result.put("value", BigDecimal.valueOf(value.unitValueCents, 2));
        result.put("category", value.category);
        put(result, "subcategory", value.subcategory);
        put(result, "supplier", value.supplier);
        result.put("eventTypes", value.eventTags == null ? List.of() : value.eventTags);
        result.put("isConsumable", value.consumable);
        put(result, "storageLocation", value.storageLocation == null ? null : value.storageLocation.id.toString());
        result.put("status", value.active ? "available" : "retired");
        var images = catalogOrm.itemImages(value).stream().map(image -> image.objectKey).toList();
        result.put("images", images);
        put(result, "hint", value.hint);
        put(result, "positionDetails", value.positionDetails);
        put(result, "containerSize", value.containerSize);
        put(result, "containerCount", value.containerCount);
        put(result, "containersOpened", value.containersOpened);
        put(result, "containerRemainingPercent", value.containerRemainingPercent);
        put(result, "maintenanceIntervalDays", value.maintenanceIntervalDays);
        put(result, "nextMaintenanceDue", value.nextMaintenanceDue);
        put(result, "currentOperatingHours", value.currentOperatingHours);
        put(result, "maintenanceStatus", value.maintenanceStatus == null ? null : value.maintenanceStatus.name());
        if (value.storageLocation != null) result.put("expand", Map.of("storageLocation", location(value.storageLocation)));
        return result;
    }

    public Map<String, Object> assembly(Assembly value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        result.put("name", value.name);
        put(result, "description", value.description);
        put(result, "hint", value.hint);
        result.put("eventTypes", value.eventTags == null ? List.of() : value.eventTags);
        var components = catalogOrm.assemblyItems(value);
        var quantities = new LinkedHashMap<String, Integer>();
        var items = new ArrayList<Map<String, Object>>();
        for (var component : components) {
            quantities.put(component.item.id.toString(), component.quantity);
            items.add(item(component.item));
        }
        result.put("itemIds", quantities.keySet());
        result.put("itemQuantities", quantities);
        result.put("expand", Map.of("itemIds", items));
        return result;
    }

    public Map<String, Object> event(EventOccurrence value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        result.put("eventType", value.eventType);
        result.put("name", value.name);
        result.put("eventDate", value.startDate);
        result.put("startDate", value.startDate);
        result.put("endDate", value.endDate);
        result.put("status", value.status);
        put(result, "notes", value.notes);
        result.put("itemIds", List.of());
        result.put("plannedQuantities", Map.of());
        result.put("usedQuantities", Map.of());
        return result;
    }

    public Map<String, Object> faction(Faction value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        result.put("eventType", value.eventType);
        result.put("name", value.name);
        result.put("slug", value.slug);
        result.put("active", value.active);
        return result;
    }

    public Map<String, Object> transaction(StockTransaction value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        result.put("itemId", value.item.id.toString());
        result.put("userId", value.user.id.toString());
        result.put("transactionType", value.type.name());
        result.put("quantityChanged", value.quantity);
        put(result, "factionOrderId", value.factionOrder == null ? null : value.factionOrder.id.toString());
        put(result, "damageReportId", value.damageReport == null ? null : value.damageReport.id.toString());
        put(result, "reason", value.reason);
        put(result, "notes", value.notes);
        result.put("timestamp", value.occurredAt);
        var expand = new LinkedHashMap<String, Object>();
        expand.put("userId", user(value.user));
        if (value.factionOrder != null) expand.put("factionOrderId", orderSummary(value.factionOrder));
        result.put("expand", expand);
        return result;
    }

    public Map<String, Object> order(FactionOrder value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        result.putAll(orderSummary(value));
        result.put("factionKey", value.faction.eventType + ":" + value.faction.name);
        put(result, "pickupLocation", value.pickupLocation == null ? null : value.pickupLocation.id.toString());
        put(result, "pickupLatitude", value.pickupLatitude);
        put(result, "pickupLongitude", value.pickupLongitude);
        put(result, "collectorName", value.collectorName);
        put(result, "notes", value.notes);
        put(result, "createdBy", value.createdBy == null ? null : value.createdBy.id.toString());
        put(result, "preparedBy", value.preparedBy == null ? null : value.preparedBy.id.toString());
        put(result, "readyBy", value.readyBy == null ? null : value.readyBy.id.toString());
        put(result, "pickedUpBy", value.pickedUpBy == null ? null : value.pickedUpBy.id.toString());
        put(result, "returnedBy", value.returnedBy == null ? null : value.returnedBy.id.toString());

        var requested = new LinkedHashMap<String, Integer>();
        var prepared = new LinkedHashMap<String, Integer>();
        var pickedUp = new LinkedHashMap<String, Integer>();
        var returned = new LinkedHashMap<String, Integer>();
        var missing = new LinkedHashMap<String, Integer>();
        var damaged = new LinkedHashMap<String, Integer>();
        var requestedAssemblies = new LinkedHashMap<String, Integer>();
        var preparedAssemblies = new LinkedHashMap<String, Integer>();
        var assemblyViews = new ArrayList<Map<String, Object>>();
        var itemViews = new ArrayList<Map<String, Object>>();
        var lines = orderOrm.lines(value);
        for (var line : lines) {
            String id = line.item.id.toString();
            if (line.sourceAssembly == null) {
                requested.merge(id, line.requestedQuantity, Integer::sum);
                prepared.merge(id, line.preparedQuantity, Integer::sum);
            }
            pickedUp.merge(id, line.pickedUpQuantity, Integer::sum);
            returned.merge(id, line.returnedQuantity, Integer::sum);
            missing.merge(id, line.missingQuantity, Integer::sum);
            damaged.merge(id, line.damagedQuantity, Integer::sum);
            if (itemViews.stream().noneMatch(existing -> id.equals(existing.get("id")))) itemViews.add(item(line.item));
            if (line.sourceAssembly != null && assemblyViews.stream().noneMatch(existing -> line.sourceAssembly.id.toString().equals(existing.get("id")))) {
                assemblyViews.add(assembly(line.sourceAssembly));
            }
        }
        for (var assemblyView : assemblyViews) {
            String assemblyId = assemblyView.get("id").toString();
            var assemblyLines = lines.stream().filter(line -> line.sourceAssembly != null && line.sourceAssembly.id.toString().equals(assemblyId)).toList();
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
        result.put("itemIds", requested.keySet());
        result.put("requestedQuantities", requested);
        result.put("preparedQuantities", prepared);
        result.put("pickedUpQuantities", pickedUp);
        result.put("returnedQuantities", returned);
        result.put("missingQuantities", missing);
        result.put("damagedQuantities", damaged);
        result.put("assemblyIds", requestedAssemblies.keySet());
        result.put("requestedAssemblyQuantities", requestedAssemblies);
        result.put("preparedAssemblyQuantities", preparedAssemblies);

        var history = orderOrm.history(value).stream().map(this::history).toList();
        result.put("history", history);
        var expand = new LinkedHashMap<String, Object>();
        expand.put("itemIds", itemViews);
        expand.put("assemblyIds", assemblyViews);
        if (value.createdBy != null) expand.put("createdBy", user(value.createdBy));
        if (value.preparedBy != null) expand.put("preparedBy", user(value.preparedBy));
        if (value.readyBy != null) expand.put("readyBy", user(value.readyBy));
        if (value.pickedUpBy != null) expand.put("pickedUpBy", user(value.pickedUpBy));
        if (value.returnedBy != null) expand.put("returnedBy", user(value.returnedBy));
        if (value.pickupLocation != null) expand.put("pickupLocation", location(value.pickupLocation));
        result.put("expand", expand);
        return result;
    }

    public Map<String, Object> damage(DamageReport value) {
        var result = base(value.id, value.createdAt, value.updatedAt);
        result.put("itemId", value.item.id.toString());
        result.put("amount", value.quantity);
        result.put("repairedAmount", value.repairedQuantity);
        result.put("writtenOffAmount", value.writtenOffQuantity);
        result.put("reportedBy", value.reporter.id.toString());
        put(result, "handledBy", value.handler == null ? null : value.handler.id.toString());
        put(result, "factionOrderId", value.factionOrder == null ? null : value.factionOrder.id.toString());
        result.put("description", value.description);
        result.put("severity", value.severity.name());
        result.put("status", value.status.name());
        result.put("timestamp", value.createdAt);
        var expand = new LinkedHashMap<String, Object>();
        expand.put("reportedBy", user(value.reporter));
        if (value.handler != null) expand.put("handledBy", user(value.handler));
        result.put("expand", expand);
        return result;
    }

    public Map<String, Object> maintenance(MaintenanceRecord value) {
        var result = new LinkedHashMap<String, Object>();
        result.put("id", value.id.toString());
        result.put("itemId", value.item.id.toString());
        result.put("type", value.type.name());
        result.put("inspectorUserId", value.inspector.id.toString());
        result.put("performedAt", value.performedAt);
        put(result, "nextDueAt", value.nextDueAt);
        put(result, "operatingHours", value.operatingHours);
        result.put("result", value.result.name());
        put(result, "certificateNumber", value.certificateNumber);
        put(result, "notes", value.notes);
        result.put("created", value.createdAt);
        return result;
    }

    private Map<String, Object> history(FactionOrderHistory value) {
        var result = new LinkedHashMap<String, Object>();
        result.put("action", value.action);
        result.put("userId", value.actor.id.toString());
        result.put("userName", value.actor.name);
        result.put("timestamp", value.occurredAt);
        put(result, "fromStatus", value.fromStatus);
        put(result, "toStatus", value.toStatus);
        result.put("deltaSnapshot", value.deltaSnapshot);
        put(result, "note", value.notes);
        return result;
    }

    private Map<String, Object> orderSummary(FactionOrder value) {
        var result = new LinkedHashMap<String, Object>();
        result.put("id", value.id.toString());
        result.put("orderCode", value.orderCode);
        result.put("eventType", value.eventOccurrence.eventType);
        result.put("eventOccurrenceId", value.eventOccurrence.id.toString());
        result.put("eventDate", value.eventOccurrence.startDate);
        result.put("faction", value.faction.name);
        result.put("factionId", value.faction.id.toString());
        result.put("status", value.status.name());
        return result;
    }

    private LinkedHashMap<String, Object> base(Object id, Object created, Object updated) {
        var result = new LinkedHashMap<String, Object>();
        result.put("id", id.toString());
        result.put("created", created);
        result.put("updated", updated);
        return result;
    }

    private void put(Map<String, Object> target, String key, Object value) {
        if (value != null) target.put(key, value);
    }
}
