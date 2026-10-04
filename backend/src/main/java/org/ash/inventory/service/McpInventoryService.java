package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Validator;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.mcp.InventoryMcpDtos;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.Item;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiMapper;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.resource.dto.ApiResponses;

import java.time.LocalDate;
import java.util.*;

/** Authorized MCP use cases. Persistence and domain decisions remain in their existing owners. */
@ApplicationScoped
@Transactional
public class McpInventoryService {
    @Inject ActorService actors;
    @Inject CatalogService catalog;
    @Inject ApiQueryService queries;
    @Inject ApiMapper mapper;
    @Inject InventoryOperationsService inventory;
    @Inject PositionService positions;
    @Inject Validator validator;

    public void authenticate() { actors.current(); }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public ApiResponses.ItemResponse createItem(ApiModels.ItemInput input) {
        return queries.projectItem(catalog.createItem(valid(input)));
    }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public ApiResponses.ItemResponse updateItem(UUID id, ApiModels.ItemInput input) {
        return queries.projectItem(catalog.updateItem(id, valid(input)));
    }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public InventoryMcpDtos.DeleteResultDto retireItem(UUID id) {
        catalog.retireItem(id);
        return new InventoryMcpDtos.DeleteResultDto(true, "Item", id, "Item retired; history preserved");
    }

    @Transactional(Transactional.TxType.NOT_SUPPORTED)
    public ApiResponses.ItemResponse item(UUID id) { return queries.item(id); }

    @org.ash.inventory.helper.ConsistentRead
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<ApiResponses.ItemResponse> items(String search, String category, Integer page, Integer limit) {
        var bounds = bounds(page, limit);
        return queries.projectItems(catalog.getItems(search, category, bounds.offset(), bounds.limit()));
    }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public ApiResponses.AssemblyResponse createAssembly(ApiModels.AssemblyInput input) {
        actors.requireManager();
        return queries.projectAssembly(catalog.createAssembly(valid(input)));
    }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public ApiResponses.AssemblyResponse updateAssembly(UUID id, ApiModels.AssemblyInput input) {
        actors.requireManager();
        return queries.projectAssembly(catalog.updateAssembly(id, valid(input)));
    }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public InventoryMcpDtos.DeleteResultDto deleteAssembly(UUID id) {
        actors.requireManager();
        catalog.deleteAssembly(id);
        return new InventoryMcpDtos.DeleteResultDto(true, "Assembly", id, "Assembly deleted");
    }

    public ApiResponses.AssemblyResponse assembly(UUID id) { return queries.assembly(id); }

    public List<ApiResponses.AssemblyResponse> assemblies(String eventTag) {
        return queries.assemblies().stream().filter(a -> eventTag == null || eventTag.isBlank()
                || a.eventTypes().contains(eventTag.trim())).toList();
    }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public ApiResponses.EventResponse createEvent(ApiModels.EventInput input) {
        actors.requirePlanner();
        valid(input);
        requireVisibleQuantities(input);
        return visibleEvents(List.of(queries.projectEvent(catalog.createEvent(input)))).getFirst();
    }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public ApiResponses.EventResponse updateEvent(UUID id, ApiModels.EventInput input) {
        actors.requirePlanner();
        valid(input);
        requireVisibleQuantities(input);
        return visibleEvents(List.of(queries.projectEvent(catalog.updateEvent(id, input)))).getFirst();
    }

    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public InventoryMcpDtos.DeleteResultDto deleteEvent(UUID id) {
        actors.requirePlanner();
        catalog.deleteEvent(id);
        return new InventoryMcpDtos.DeleteResultDto(true, "EventOccurrence", id, "Event deleted");
    }

    public ApiResponses.EventResponse event(UUID id) {
        return visibleEvents(List.of(queries.event(id))).getFirst();
    }

    public List<ApiResponses.EventResponse> events(String status) {
        actors.current();
        var values = catalog.getEvents(null).stream()
                .filter(e -> status == null || status.isBlank() || status.trim().equalsIgnoreCase(e.status))
                .sorted(Comparator.comparing(e -> e.startDate)).limit(50).toList();
        return visibleEvents(queries.projectEvents(values));
    }

    private void requireVisibleQuantities(ApiModels.EventInput input) {
        var ids = new HashSet<UUID>();
        if (input.plannedQuantities() != null) ids.addAll(input.plannedQuantities().keySet());
        if (input.usedQuantities() != null) ids.addAll(input.usedQuantities().keySet());
        var visible = new HashSet<>(catalog.getVisibleItemIds());
        if (!visible.containsAll(ids)) throw ApiException.notFound("Item not found");
    }

    private List<ApiResponses.EventResponse> visibleEvents(List<ApiResponses.EventResponse> values) {
        var ids = catalog.getVisibleItemIds().stream().map(UUID::toString).collect(java.util.stream.Collectors.toSet());
        return values.stream().map(e -> {
            var quantities = new LinkedHashMap<String, Map<String, Integer>>();
            e.quantities().forEach((key, amount) -> quantities.put(key, visibleMap(amount, ids)));
            return new ApiResponses.EventResponse(e.id(), e.created(), e.updated(), e.eventType(), e.name(),
                    e.eventDate(), e.startDate(), e.endDate(), e.status(), e.notes(),
                    e.itemIds().stream().filter(ids::contains).toList(), visibleMap(e.plannedQuantities(), ids),
                    visibleMap(e.usedQuantities(), ids), visibleMap(e.itemNames(), ids), quantities);
        }).toList();
    }

    private <T> Map<String, T> visibleMap(Map<String, T> values, Set<String> ids) {
        var result = new LinkedHashMap<String, T>();
        values.forEach((id, value) -> { if (ids.contains(id)) result.put(id, value); });
        return result;
    }

    public List<ApiResponses.StorageLocationResponse> locations(UUID warehouseId) {
        actors.current();
        return mapper.locations(catalog.getLocations().stream().filter(l -> warehouseId == null
                || (l.warehouse != null && warehouseId.equals(l.warehouse.id))).toList());
    }

    public List<String> categories() { return catalog.getVisibleCategories(); }

    public List<ApiResponses.AssetInstanceResponse> assets(UUID itemId, DomainEnums.AssetState status, Integer page, Integer limit) {
        var bounds = bounds(page, limit);
        return mapper.assets(catalog.getAssets(itemId, status, bounds.offset(), bounds.limit()));
    }

    public List<InventoryMcpDtos.StockPositionDto> positions(UUID id) {
        var item = catalog.getVisibleItem(id);
        // Serialized quantities live on assets, never on bulk/lot positions.
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) return List.of();
        var policy = inventory.readStock(List.of(item)).get(id).policy();
        var reserved = positions.reservedAt(List.of(item), policy.positions());
        boolean usable = EquipmentService.freelyAvailable(item) && policy.itemUsable() && !policy.hasMemberDamage();
        return policy.positions().stream().filter(p -> actors.canViewLocation(p.location)).map(p -> new InventoryMcpDtos.StockPositionDto(p.id,
                p.location.id.toString(), p.location.name, p.quantityOnHand,
                p.quantityReserved + reserved.getOrDefault(p.id, 0),
                usable ? Math.max(0, p.availableQuantity() - reserved.getOrDefault(p.id, 0)) : 0,
                p.quantityDamaged, p.quantityQuarantined, p.quantityInTransit,
                p.lot == null ? null : p.lot.lotNumber, p.lot == null || p.lot.expiryDate == null ? null : p.lot.expiryDate.toString())).toList();
    }

    public List<InventoryMcpDtos.LowStockAlertDto> lowStock(Integer threshold) {
        int buffer = threshold == null ? 0 : threshold;
        if (buffer < 0) throw ApiException.badRequest("threshold must be non-negative");
        var items = catalog.getItems(null, 0, Integer.MAX_VALUE).stream().filter(i -> i.minStock > 0).toList();
        var stock = inventory.stock(items);
        return items.stream().filter(i -> (long) stock.get(i.id).available() <= (long) i.minStock + buffer)
                .map(i -> new InventoryMcpDtos.LowStockAlertDto(i.id, i.sku, i.name, stock.get(i.id).onHand(),
                        stock.get(i.id).available(), i.minStock, Math.max(0, i.minStock - stock.get(i.id).available()),
                        actors.canViewLocation(i.storageLocation) ? i.storageLocation.name : null)).toList();
    }

    public InventoryMcpDtos.OperationalMetricsDto summary() {
        var items = catalog.getItems(null, 0, Integer.MAX_VALUE);
        var stock = inventory.readStock(items);
        return new InventoryMcpDtos.OperationalMetricsDto(items.size(),
                stock.values().stream().mapToLong(s -> s.policy().assets().size()).sum(),
                catalog.getLocations().size(), catalog.getEvents(null).stream()
                        .filter(e -> !e.startDate.isBefore(LocalDate.now()) && !"cancelled".equalsIgnoreCase(e.status)).count(),
                maintenanceAlerts(items, stock).size());
    }

    public List<InventoryMcpDtos.MaintenanceAlertDto> maintenanceAlerts() {
        var items = catalog.getItems(null, 0, Integer.MAX_VALUE);
        return maintenanceAlerts(items, inventory.readStock(items));
    }

    private List<InventoryMcpDtos.MaintenanceAlertDto> maintenanceAlerts(List<Item> items,
            Map<UUID, InventoryOperationsService.ReadStock> stock) {
        var alerts = new ArrayList<InventoryMcpDtos.MaintenanceAlertDto>();
        var today = LocalDate.now();
        for (var item : items) {
            var policy = stock.get(item.id).policy();
            boolean itemScheduled = false;
            for (var schedule : policy.schedules()) {
                if (schedule.assetInstance != null && !schedule.assetInstance.active) continue;
                if (schedule.assetInstance == null) itemScheduled = true;
                var status = policy.status(schedule);
                if (status == MaintenancePolicy.Status.healthy) continue;
                alerts.add(new InventoryMcpDtos.MaintenanceAlertDto("schedule", schedule.id,
                        schedule.assetInstance == null ? item.sku : schedule.assetInstance.assetCode, item.name,
                        schedule.maintenanceType + " (" + schedule.intervalType + ")", status.name(),
                        schedule.nextDueAt == null ? null : schedule.nextDueAt.toString()));
            }
            boolean flagged = item.maintenanceStatus != DomainEnums.MaintenanceStatus.certified;
            if (flagged
                    || (!itemScheduled && item.nextMaintenanceDue != null && !item.nextMaintenanceDue.isAfter(today.plusDays(30)))) {
                String status = flagged ? item.maintenanceStatus.name()
                        : item.nextMaintenanceDue.isBefore(today) ? "due" : "warning";
                alerts.add(new InventoryMcpDtos.MaintenanceAlertDto("item", item.id, item.sku, item.name,
                        "Item maintenance", status, item.nextMaintenanceDue == null ? null : item.nextMaintenanceDue.toString()));
            }
            for (var asset : policy.assets()) {
                if (asset.conditionStatus == DomainEnums.ConditionStatus.damaged || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe
                        || asset.serviceStatus == DomainEnums.MaintenanceStatus.overdue || asset.serviceStatus == DomainEnums.MaintenanceStatus.due_soon
                        || asset.serviceStatus == DomainEnums.MaintenanceStatus.in_service) {
                    alerts.add(new InventoryMcpDtos.MaintenanceAlertDto("asset", asset.id, asset.assetCode, item.name,
                            "Condition: " + asset.conditionStatus + "; service: " + asset.serviceStatus, asset.serviceStatus.name(), null));
                }
            }
        }
        return List.copyOf(alerts);
    }

    private <T> T valid(T input) {
        if (input == null) throw ApiException.badRequest("input is required");
        var violations = validator.validate(input);
        if (!violations.isEmpty()) throw ApiException.badRequest(violations.stream()
                .map(v -> v.getPropertyPath() + " " + v.getMessage()).sorted().collect(java.util.stream.Collectors.joining("; ")));
        return input;
    }

    private PageBounds bounds(Integer page, Integer limit) {
        int index = page == null ? 0 : page;
        int size = limit == null ? 20 : limit;
        if (index < 0 || size < 1 || size > 100) throw ApiException.badRequest("page must be non-negative; limit must be 1–100");
        try { return new PageBounds(Math.multiplyExact(index, size), size); }
        catch (ArithmeticException exception) { throw ApiException.badRequest("page is too large"); }
    }
    private record PageBounds(int offset, int limit) {}
}
