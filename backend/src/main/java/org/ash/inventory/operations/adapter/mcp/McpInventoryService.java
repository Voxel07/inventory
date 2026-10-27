package org.ash.inventory.operations.adapter.mcp;

import org.ash.inventory.operations.internal.application.ApiQueryService;
import org.ash.inventory.operations.internal.application.CatalogService;
import org.ash.inventory.operations.internal.application.CustodyBalanceService;
import org.ash.inventory.operations.internal.application.EquipmentPolicy;
import org.ash.inventory.operations.internal.application.InventoryOperationsService;
import org.ash.inventory.operations.internal.application.MaintenancePolicy;
import org.ash.inventory.operations.internal.application.OrderService;
import org.ash.inventory.operations.internal.application.PositionService;
import org.ash.inventory.operations.internal.application.PrivacyProjectionService;
import org.ash.inventory.operations.internal.application.StockReadService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.persistence.CatalogOrm;
import org.ash.inventory.operations.internal.projection.ApiMapper;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.BusinessTime;
import org.ash.inventory.platform.api.PageBounds;
import org.ash.inventory.platform.persistence.ConsistentRead;
import org.ash.inventory.platform.ratelimit.ApiBudget;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Validator;
import java.util.*;

/** Authorized MCP use cases. Persistence and domain decisions remain in their existing owners. */
@ApplicationScoped
@Transactional
public class McpInventoryService {
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.StockReadService stockReads;
    @Inject ActorService actors;
    @Inject CatalogService catalog;
    @Inject ApiQueryService queries;
    @Inject ApiMapper mapper;
    @Inject InventoryOperationsService inventory;
    @Inject PositionService positions;
    @Inject Validator validator;
    @Inject org.ash.inventory.platform.ratelimit.ApiBudget rateLimit;
    @Inject org.ash.inventory.operations.internal.persistence.CatalogOrm catalogOrm;
    @Inject OrderService orders;
    @Inject PrivacyProjectionService privacy;
    @Inject CustodyBalanceService custody;

    public com.fasterxml.jackson.databind.JsonNode custody(UUID itemId, UUID personId, UUID orderId, Integer page, Integer limit) {
        actors.requireWarehouse(); var bounds = bounds(page, limit);
        var rows = custody.of(personId, itemId).stream().filter(r -> orderId == null || orderId.equals(r.orderId()))
                .sorted(Comparator.comparing(CustodyBalanceService.Balance::key)).toList();
        var visible = privacy.filter(rows, false).value();
        var result = new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode();
        for (int index = bounds.offset(); index < Math.min(visible.size(), bounds.offset() + bounds.limit()); index++) result.add(visible.get(index));
        return result;
    }

    public com.fasterxml.jackson.databind.JsonNode movements(UUID itemId, UUID assetId, UUID personId, String type, Integer page, Integer limit) {
        var bounds = bounds(page, limit);
        return privacy.filter(queries.transactions(itemId, assetId, personId, null, type, null, null, null, bounds.offset() / bounds.limit(), bounds.limit()), false).value();
    }

    public com.fasterxml.jackson.databind.JsonNode order(UUID id) { return privacy.filter(queries.orderDetail(id), true).value(); }
    public com.fasterxml.jackson.databind.JsonNode createFactionOrder(ApiModels.OrderInput input) {
        return privacy.filter(queries.projectOrder(orders.create(valid(input))), false).value();
    }
    public com.fasterxml.jackson.databind.JsonNode createGeneralOrder(ApiModels.GeneralOrderInput input) {
        return privacy.filter(queries.projectGeneralOrder(orders.createGeneral(valid(input))), false).value();
    }
    public com.fasterxml.jackson.databind.JsonNode prepareOrder(UUID id, ApiModels.PreparationInput input) {
        return privacy.filter(queries.projectAnyOrder(orders.prepare(id, valid(input))), false).value();
    }
    public com.fasterxml.jackson.databind.JsonNode transitionOrder(UUID id, DomainEnums.OrderStatus status, ApiModels.TransitionInput input) {
        return privacy.filter(queries.projectAnyOrder(orders.transition(id, status, valid(input))), false).value();
    }
    public com.fasterxml.jackson.databind.JsonNode returnOrder(UUID id, ApiModels.ReturnInput input) {
        return privacy.filter(queries.projectAnyOrder(orders.returnItems(id, valid(input))), false).value();
    }

    /** MCP serves organization data only; tenant accounts manage their private items in the app. */
    public void authenticate() {
        var actor = actors.current();
        rateLimit.acquire(rateLimit.caller(actor.id.toString()));
        actors.requireReader();
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public ApiResponses.ItemResponse createItem(ApiModels.ItemInput input) {
        return queries.projectItem(catalog.createItem(valid(input)));
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public List<ApiResponses.ItemResponse> saveItems(ApiModels.ItemBatchInput input) {
        return queries.projectItems(catalog.saveItems(valid(input).items()));
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public ApiResponses.ItemResponse updateItem(UUID id, ApiModels.ItemInput input) {
        return queries.projectItem(catalog.updateItem(id, valid(input)));
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public InventoryMcpDtos.DeleteResultDto retireItem(UUID id) {
        catalog.retireItem(id);
        return new InventoryMcpDtos.DeleteResultDto(true, "Item", id, "Item retired; history preserved");
    }

    @Transactional(Transactional.TxType.NOT_SUPPORTED)
    public ApiResponses.ItemResponse item(UUID id) { return queries.item(id); }

    @org.ash.inventory.platform.persistence.ConsistentRead
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<ApiResponses.ItemResponse> items(String search, String category, Integer page, Integer limit) {
        var bounds = bounds(page, limit);
        return queries.projectItems(catalog.getItems(search, category, bounds.offset(), bounds.limit()));
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public ApiResponses.AssemblyResponse createAssembly(ApiModels.AssemblyInput input) {
        return queries.projectAssembly(catalog.createAssembly(valid(input)));
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public ApiResponses.AssemblyResponse updateAssembly(UUID id, ApiModels.AssemblyInput input) {
        return queries.projectAssembly(catalog.updateAssembly(id, valid(input)));
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public InventoryMcpDtos.DeleteResultDto deleteAssembly(UUID id) {
        catalog.retireAssembly(id);
        return new InventoryMcpDtos.DeleteResultDto(true, "Assembly", id, "Assembly retired");
    }

    public ApiResponses.AssemblyResponse assembly(UUID id) { return queries.assembly(id); }

    public List<ApiResponses.AssemblyResponse> assemblies(String eventTag, Integer page, Integer limit) {
        var bounds = bounds(page, limit);
        return queries.assemblies(null, eventTag, false, bounds.offset() / bounds.limit(), bounds.limit());
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public ApiResponses.EventResponse createEvent(ApiModels.EventInput input) {
        actors.requireAdmin();
        valid(input);
        requireVisibleQuantities(input);
        return visibleEvents(List.of(queries.projectEvent(catalog.createEvent(input)))).getFirst();
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public ApiResponses.EventResponse updateEvent(UUID id, ApiModels.EventInput input) {
        actors.requireAdmin();
        valid(input);
        requireVisibleQuantities(input);
        return visibleEvents(List.of(queries.projectEvent(catalog.updateEvent(id, input)))).getFirst();
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public InventoryMcpDtos.DeleteResultDto deleteEvent(UUID id) {
        actors.requireAdmin();
        catalog.deleteEvent(id);
        return new InventoryMcpDtos.DeleteResultDto(true, "EventOccurrence", id, "Event deleted");
    }

    public ApiResponses.EventResponse event(UUID id) {
        return visibleEvents(List.of(queries.event(id))).getFirst();
    }

    public List<ApiResponses.EventResponse> events(String status, Integer page, Integer limit) {
        actors.current();
        var bounds = bounds(page, limit);
        var values = catalogOrm.events(null, status, bounds.offset(), bounds.limit(), true);
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
        var candidates = values.stream().flatMap(e -> e.itemIds().stream()).map(UUID::fromString).distinct().toList();
        var ids = catalogOrm.visibleItemIds(candidates).stream().map(UUID::toString).collect(java.util.stream.Collectors.toSet());
        return values.stream().map(e -> {
            var quantities = new LinkedHashMap<String, Map<String, Integer>>();
            e.quantities().forEach((key, amount) -> quantities.put(key, visibleMap(amount, ids)));
            return new ApiResponses.EventResponse(e.id(), e.created(), e.updated(), e.eventType(), e.name(),
                    e.eventDate(), e.startDate(), e.endDate(), e.status(), e.notes(),
                    e.itemIds().stream().filter(ids::contains).toList(), visibleMap(e.plannedQuantities(), ids),
                    visibleMap(e.usedQuantities(), ids), visibleMap(e.itemNames(), ids), quantities, e.orderDeadline());
        }).toList();
    }

    private <T> Map<String, T> visibleMap(Map<String, T> values, Set<String> ids) {
        var result = new LinkedHashMap<String, T>();
        values.forEach((id, value) -> { if (ids.contains(id)) result.put(id, value); });
        return result;
    }

    public List<ApiResponses.StorageLocationResponse> locations(UUID locationId, Integer page, Integer limit) {
        actors.current();
        var bounds = bounds(page, limit);
        return mapper.locations(catalogOrm.locations(false, null, locationId, bounds.offset(), bounds.limit()));
    }

    public InventoryMcpDtos.ResourcePage<ApiResponses.StorageLocationResponse> locationResource() {
        var values = catalogOrm.locations(false, null, null, 0, 101);
        boolean more = values.size() > 100;
        return new InventoryMcpDtos.ResourcePage<>(mapper.locations(values.stream().limit(100).toList()),
                0, 100, more, more ? 1 : null, "list_storage_locations");
    }

    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public List<ApiResponses.StorageLocationResponse> saveStorageStructure(ApiModels.StorageStructureInput input) {
        return mapper.locations(catalog.saveStructure(valid(input)));
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
        var policy = stockReads.readStock(List.of(item)).get(id).policy();
        var reserved = positions.reservedAt(List.of(item), policy.positions());
        boolean usable = EquipmentPolicy.freelyAvailable(item) && policy.eligible();
        return policy.positions().stream().filter(p -> actors.canViewLocation(p.location)).map(p -> new InventoryMcpDtos.StockPositionDto(p.id,
                p.location.id.toString(), p.location.name, p.quantityOnHand,
                reserved.getOrDefault(p.id, 0),
                usable ? Math.max(0, p.availableQuantity() - reserved.getOrDefault(p.id, 0)) : 0,
                p.quantityDamaged, p.quantityQuarantined, p.quantityInTransit,
                p.lot == null ? null : p.lot.lotNumber, p.lot == null || p.lot.expiryDate == null ? null : org.ash.inventory.platform.api.EpochTime.millis(p.lot.expiryDate))).toList();
    }

    /** Evaluates one bounded page of the visible catalog; continue while {@code hasMore}. */
    public InventoryMcpDtos.AlertPage<InventoryMcpDtos.LowStockAlertDto> lowStock(Integer threshold, Integer page, Integer limit) {
        int buffer = threshold == null ? 0 : threshold;
        if (buffer < 0) throw ApiException.badRequest("threshold must be non-negative");
        var bounds = bounds(page, limit);
        var window = catalog.getItems(null, null, bounds.offset(), bounds.limit() + 1);
        var items = window.stream().limit(bounds.limit()).filter(i -> i.minStock > 0).toList();
        var stock = inventory.stock(items);
        return new InventoryMcpDtos.AlertPage<>(items.stream().filter(i -> (long) stock.get(i.id).available() <= (long) i.minStock + buffer)
                .map(i -> new InventoryMcpDtos.LowStockAlertDto(i.id, i.sku, i.name, stock.get(i.id).onHand(),
                        stock.get(i.id).available(), i.minStock, Math.max(0, i.minStock - stock.get(i.id).available()),
                        actors.canViewLocation(i.storageLocation) ? i.storageLocation.name : null)).toList(),
                bounds.offset() / bounds.limit(), bounds.limit(), window.size() > bounds.limit());
    }

    /** Aggregate counts only; maintenance alerts are read page by page with {@link #maintenanceAlerts}. */
    public InventoryMcpDtos.OperationalMetricsDto summary() {
        actors.current();
        var counts = catalogOrm.visibleCounts();
        return new InventoryMcpDtos.OperationalMetricsDto(counts.items(), counts.serializedAssets(), counts.locations(),
                catalogOrm.upcomingEventCount(BusinessTime.today()));
    }

    /** Evaluates one bounded page of the visible catalog; continue while {@code hasMore}. */
    public InventoryMcpDtos.AlertPage<InventoryMcpDtos.MaintenanceAlertDto> maintenanceAlerts(Integer page, Integer limit) {
        var bounds = bounds(page, limit);
        var window = catalog.getItems(null, null, bounds.offset(), bounds.limit() + 1);
        var items = window.stream().limit(bounds.limit()).toList();
        return new InventoryMcpDtos.AlertPage<>(maintenanceAlerts(items, stockReads.readStock(items)),
                bounds.offset() / bounds.limit(), bounds.limit(), window.size() > bounds.limit());
    }

    private List<InventoryMcpDtos.MaintenanceAlertDto> maintenanceAlerts(List<Item> items,
            Map<UUID, StockReadService.ReadStock> stock) {
        var alerts = new ArrayList<InventoryMcpDtos.MaintenanceAlertDto>();
        var today = BusinessTime.today();
        for (var item : items) {
            var policy = stock.get(item.id).policy();
            for (var schedule : policy.schedules()) {
                if (schedule.assetInstance != null && !schedule.assetInstance.active) continue;
                var status = policy.status(schedule);
                if (status == MaintenancePolicy.Status.healthy) continue;
                alerts.add(new InventoryMcpDtos.MaintenanceAlertDto("schedule", schedule.id,
                        schedule.assetInstance == null ? item.sku : schedule.assetInstance.assetCode, item.name,
                        schedule.maintenanceType + " (" + schedule.intervalType + ")", status.name(),
                        schedule.nextDueAt == null ? null : schedule.nextDueAt.toEpochMilli()));
            }
            var itemStatus = MaintenancePolicy.itemStatus(item, today);
            boolean flagged = itemStatus == DomainEnums.MaintenanceStatus.in_service;
            if (flagged) {
                alerts.add(new InventoryMcpDtos.MaintenanceAlertDto("item", item.id, item.sku, item.name,
                        "Item maintenance", itemStatus.name(), null));
            }
            for (var asset : policy.assets()) {
                // Schedule alerts above carry due dates; a condition/safety hold has no independent due date.
                var serviceStatus = MaintenancePolicy.assetStatus(asset, today);
                if (asset.conditionStatus == DomainEnums.ConditionStatus.damaged || asset.conditionStatus == DomainEnums.ConditionStatus.unsafe
                        || serviceStatus != DomainEnums.MaintenanceStatus.certified) {
                    alerts.add(new InventoryMcpDtos.MaintenanceAlertDto("asset", asset.id, asset.assetCode, item.name,
                            "Condition: " + asset.conditionStatus + "; service: " + serviceStatus, serviceStatus.name(),
                            null));
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

    /** MCP pages default to 20 and hold at most 100 rows. */
    private static org.ash.inventory.platform.api.PageBounds bounds(Integer page, Integer limit) {
        return org.ash.inventory.platform.api.PageBounds.of(page == null ? 0 : page, limit == null ? 20 : limit, 100);
    }
}
