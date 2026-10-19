package org.ash.inventory.mcp;

import org.ash.inventory.helper.telemetry.InventoryTelemetry;
import io.quarkiverse.mcp.server.Tool;
import io.quarkiverse.mcp.server.ToolArg;
import io.quarkiverse.mcp.server.ToolCallException;
import io.smallrye.common.annotation.Blocking;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.McpInventoryService;

import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

/** MCP transport adapter; all authorized use cases finish in the transactional service. */
@ApplicationScoped
public class InventoryMcpTools {
    @Inject McpInventoryService service;
    @Inject InventoryTelemetry telemetry;

    @Blocking @Tool(description = "Read either kind of order, with the same scoped detail projection as REST")
    public com.fasterxml.jackson.databind.JsonNode get_order_details(@ToolArg(description = "Order UUID", required = true) UUID orderId) {
        return call("get_order_details", () -> service.order(orderId));
    }

    @Blocking @Tool(description = "Create a faction order using the REST OrderInput contract and faction permissions")
    public com.fasterxml.jackson.databind.JsonNode create_faction_order(@ToolArg(description = "OrderInput", required = true) ApiModels.OrderInput input) {
        return call("create_faction_order", () -> service.createFactionOrder(input));
    }

    @Blocking @Tool(description = "Create a general order using the REST GeneralOrderInput contract; ASH crew or warehouse access required")
    public com.fasterxml.jackson.databind.JsonNode create_general_order(@ToolArg(description = "GeneralOrderInput", required = true) ApiModels.GeneralOrderInput input) {
        return call("create_general_order", () -> service.createGeneralOrder(input));
    }

    @Blocking @Tool(description = "Prepare either order kind with the shared REST PreparationInput; warehouse access required")
    public com.fasterxml.jackson.databind.JsonNode prepare_order(@ToolArg(description = "Order UUID", required = true) UUID orderId,
            @ToolArg(description = "PreparationInput: preparedQuantities, assetAssignments, sourceLocations and idempotencyKey", required = true) ApiModels.PreparationInput input) {
        return call("prepare_order", () -> service.prepareOrder(orderId, input));
    }

    @Blocking @Tool(description = "Transition either order kind using the shared REST status and TransitionInput; kind-specific permissions and lifecycle rules apply")
    public com.fasterxml.jackson.databind.JsonNode transition_order(@ToolArg(description = "Order UUID", required = true) UUID orderId,
            @ToolArg(description = "Target order status", required = true) DomainEnums.OrderStatus status,
            @ToolArg(description = "TransitionInput, including idempotencyKey", required = true) ApiModels.TransitionInput input) {
        return call("transition_order", () -> service.transitionOrder(orderId, status, input));
    }

    @Blocking @Tool(description = "Reconcile either order kind with the shared REST ReturnInput; missing remains outstanding, write-offs require admin and a reason")
    public com.fasterxml.jackson.databind.JsonNode return_order(@ToolArg(description = "Order UUID", required = true) UUID orderId,
            @ToolArg(description = "ReturnInput: lines by item UUID, assets by asset UUID and idempotencyKey", required = true) ApiModels.ReturnInput input) {
        return call("return_order", () -> service.returnOrder(orderId, input));
    }

    @Blocking
    @Tool(description = "Create an item using the REST ItemInput contract. Manager access required; initial stock uses the canonical ledger and asset/position rules.")
    public ApiResponses.ItemResponse create_item(
            @ToolArg(description = "ItemInput: name/category required; value is decimal currency, locations are UUIDs; optional amount initializes stock; serialized items name those units assetCodePrefix + assetStartNumber (default SKU- and 1, zero-padded to 3 digits); optional maintenanceSchedules[] create item-wide plans (date plans need nextDueAt, operating_hours/usage_count plans need nextDueValue; operating_hours requires tracksRuntime)", required = true) ApiModels.ItemInput input) {
        return call("create_item", () -> service.createItem(input));
    }

    @Blocking
    @Tool(description = "Create or update up to 100 items in one transaction (bulk import). Entries without id are created, others updated with update_item semantics; assetCodes register serialized units. All or nothing: an error names the failing entry index.")
    public List<ApiResponses.ItemResponse> save_items(
            @ToolArg(description = "ItemBatchInput: items[] of {id?, item: ItemInput, assetCodes?}; 1–100 entries", required = true) ApiModels.ItemBatchInput input) {
        return call("save_items", () -> service.saveItems(input));
    }

    @Blocking
    @Tool(description = "Read an active, visible item with canonical stock availability and metadata")
    public ApiResponses.ItemResponse get_item_details(
            @ToolArg(description = "Item UUID", required = true) UUID itemId) {
        return call("get_item_details", () -> service.item(itemId));
    }

    @Blocking
    @Tool(description = "Search active items visible to the caller, with exact optional category and bounded pagination")
    public List<ApiResponses.ItemResponse> search_items(
            @ToolArg(description = "Name, SKU or category search", required = false) String query,
            @ToolArg(description = "Exact category", required = false) String category,
            @ToolArg(description = "Results per page, 1–100; default 20", required = false) Integer limit,
            @ToolArg(description = "Zero-based page; default 0", required = false) Integer page) {
        return call("search_items", () -> service.items(query, category, page, limit));
    }

    @Blocking
    @Tool(description = "Replace item metadata using the REST ItemInput contract. Manager access required; name/category and current visibility assignments must be supplied. Omit amount: stock changes require a stock command.")
    public ApiResponses.ItemResponse update_item(
            @ToolArg(description = "Item UUID", required = true) UUID itemId,
            @ToolArg(description = "Complete ItemInput metadata, with REST update semantics", required = true) ApiModels.ItemInput input) {
        return call("update_item", () -> service.updateItem(itemId, input));
    }

    @Blocking
    @Tool(description = "Retire an item while preserving ledger and custody history. Manager access required.")
    public InventoryMcpDtos.DeleteResultDto delete_item(
            @ToolArg(description = "Item UUID", required = true) UUID itemId) {
        return call("delete_item", () -> service.retireItem(itemId));
    }

    @Blocking
    @Tool(description = "Create a kit using the REST AssemblyInput contract. Managers create shared kits; privateResource=true (or a non-manager caller) creates a personal kit. Component quantities must be positive.")
    public ApiResponses.AssemblyResponse create_assembly(
            @ToolArg(description = "AssemblyInput: name and itemQuantities (item UUID to quantity) required", required = true) ApiModels.AssemblyInput input) {
        return call("create_assembly", () -> service.createAssembly(input));
    }

    @Blocking
    @Tool(description = "Read an assembly only when every active component is visible to the caller")
    public ApiResponses.AssemblyResponse get_assembly_details(
            @ToolArg(description = "Assembly UUID", required = true) UUID assemblyId) {
        return call("get_assembly_details", () -> service.assembly(assemblyId));
    }

    @Blocking
    @Tool(description = "List assemblies whose active components are all visible to the caller, with bounded pagination")
    public List<ApiResponses.AssemblyResponse> list_assemblies(
            @ToolArg(description = "Optional event tag", required = false) String eventTag,
            @ToolArg(description = "Zero-based page; default 0", required = false) Integer page,
            @ToolArg(description = "Results per page, 1–100; default 20", required = false) Integer limit) {
        return call("list_assemblies", () -> service.assemblies(eventTag, page, limit));
    }

    @Blocking
    @Tool(description = "Replace assembly metadata and composition using REST AssemblyInput. Managers edit shared kits; owners and editors edit personal kits.")
    public ApiResponses.AssemblyResponse update_assembly(
            @ToolArg(description = "Assembly UUID", required = true) UUID assemblyId,
            @ToolArg(description = "AssemblyInput: name and complete itemQuantities required", required = true) ApiModels.AssemblyInput input) {
        return call("update_assembly", () -> service.updateAssembly(assemblyId, input));
    }

    @Blocking
    @Tool(description = "Retire an assembly: it leaves the catalog and can no longer be ordered, while codes and order history are kept. Managers retire shared kits; owners and editors retire personal kits.")
    public InventoryMcpDtos.DeleteResultDto delete_assembly(
            @ToolArg(description = "Assembly UUID", required = true) UUID assemblyId) {
        return call("delete_assembly", () -> service.deleteAssembly(assemblyId));
    }

    @Blocking
    @Tool(description = "Create an event using REST EventInput. Inventory admin access required; item quotas must refer to visible items.")
    public ApiResponses.EventResponse create_event(
            @ToolArg(description = "EventInput: eventType and startDate (YYYY-MM-DD) required; optional name/endDate/status/notes/plannedQuantities/usedQuantities", required = true) ApiModels.EventInput input) {
        return call("create_event", () -> service.createEvent(input));
    }

    @Blocking
    @Tool(description = "Read an event with canonical deployment metrics; item IDs, names and quantities are scoped to the caller")
    public ApiResponses.EventResponse get_event_details(
            @ToolArg(description = "Event UUID", required = true) UUID eventId) {
        return call("get_event_details", () -> service.event(eventId));
    }

    @Blocking
    @Tool(description = "List events in start-date order with bounded pagination and scoped item metrics")
    public List<ApiResponses.EventResponse> list_events(
            @ToolArg(description = "Optional event status", required = false) String status,
            @ToolArg(description = "Zero-based page; default 0", required = false) Integer page,
            @ToolArg(description = "Results per page, 1–100; default 20", required = false) Integer limit) {
        return call("list_events", () -> service.events(status, page, limit));
    }

    @Blocking
    @Tool(description = "Update an event using REST EventInput, including eventType/startDate. Inventory admin access required; supplied quotas must refer to visible items.")
    public ApiResponses.EventResponse update_event(
            @ToolArg(description = "Event UUID", required = true) UUID eventId,
            @ToolArg(description = "EventInput with REST update semantics", required = true) ApiModels.EventInput input) {
        return call("update_event", () -> service.updateEvent(eventId, input));
    }

    @Blocking
    @Tool(description = "Delete an event only while no orders, stock movements, return submissions or owner commitments reference it; its planning overrides are removed with it. Inventory admin access required.")
    public InventoryMcpDtos.DeleteResultDto delete_event(
            @ToolArg(description = "Event UUID", required = true) UUID eventId) {
        return call("delete_event", () -> service.deleteEvent(eventId));
    }

    @Blocking
    @Tool(description = "List active storage locations in tree order (depth 0 = top-level location without stock, 1 = section, 2+ = storage place) with bounded pagination")
    public List<ApiResponses.StorageLocationResponse> list_storage_locations(
            @ToolArg(description = "Optional location UUID; lists it and everything below it", required = false) UUID locationId,
            @ToolArg(description = "Zero-based page; default 0", required = false) Integer page,
            @ToolArg(description = "Results per page, 1–100; default 20", required = false) Integer limit) {
        return call("list_storage_locations", () -> service.locations(locationId, page, limit));
    }

    @Blocking
    @Tool(description = "Create or extend a top-level storage location (e.g. Betriebshof) with nested sections and storage places in one step. "
            + "Nodes with an id are renamed, nodes without one are created; omitted nodes stay. Returns the whole location tree.")
    public List<ApiResponses.StorageLocationResponse> save_storage_structure(
            @ToolArg(description = "StorageStructureInput: {id?, name, code?, description?, privateResource?, sections: [{id?, name, code?, description?, children: [...]}]}", required = true)
            ApiModels.StorageStructureInput input) {
        return call("save_storage_structure", () -> service.saveStorageStructure(input));
    }

    @Blocking
    @Tool(description = "Read bulk/lot positions for a visible item, including command reservations, lot/damage/quarantine, maintenance and contributor holds. Serialized items return no positions; use assets and item stock.")
    public List<InventoryMcpDtos.StockPositionDto> get_inventory_positions(
            @ToolArg(description = "Item UUID", required = true) UUID itemId) {
        return call("get_inventory_positions", () -> service.positions(itemId));
    }

    @Blocking
    @Tool(description = "List active serialized assets of a visible item with location, custody and service metadata")
    public List<ApiResponses.AssetInstanceResponse> list_asset_instances(
            @ToolArg(description = "Item UUID", required = true) UUID itemId,
            @ToolArg(description = "Optional availability state", required = false) DomainEnums.AssetState status,
            @ToolArg(description = "Zero-based page; default 0", required = false) Integer page,
            @ToolArg(description = "Results per page, 1–100; default 20", required = false) Integer limit) {
        return call("list_asset_instances", () -> service.assets(itemId, status, page, limit));
    }

    @Blocking
    @Tool(description = "Evaluate one page of visible items and list those with usable availability at or below minStock plus buffer. Includes serialized assets, reservations and maintenance/consent holds; deficit is max(0, minStock minus available). Request the next page while hasMore is true.")
    public InventoryMcpDtos.AlertPage<InventoryMcpDtos.LowStockAlertDto> check_low_stock_items(
            @ToolArg(description = "Non-negative threshold buffer; default 0", required = false) Integer threshold,
            @ToolArg(description = "Zero-based catalog page; default 0", required = false) Integer page,
            @ToolArg(description = "Items evaluated per page, 1–100; default 20", required = false) Integer limit) {
        return call("check_low_stock_items", () -> service.lowStock(threshold, page, limit));
    }

    @Blocking
    @Tool(description = "Count visible active items and their serialized assets, shared active locations and upcoming non-cancelled events")
    public InventoryMcpDtos.OperationalMetricsDto get_operational_summary() {
        return call("get_operational_summary", () -> service.summary());
    }

    @Blocking
    @Tool(description = "Evaluate one page of visible active items for item/asset maintenance alerts, including calendar, hours and usage schedules evaluated with canonical policy; unknown meter evidence is an alert. Request the next page while hasMore is true.")
    public InventoryMcpDtos.AlertPage<InventoryMcpDtos.MaintenanceAlertDto> get_maintenance_alerts(
            @ToolArg(description = "Zero-based catalog page; default 0", required = false) Integer page,
            @ToolArg(description = "Items evaluated per page, 1–100; default 20", required = false) Integer limit) {
        return call("get_maintenance_alerts", () -> service.maintenanceAlerts(page, limit));
    }
    private <T> T call(String tool, Supplier<T> action) {
        try { return telemetry.call("mcp", tool, "service", () -> { service.authenticate(); return action.get(); }); }
        catch (ApiException exception) {
            // The transactional service has already rolled back before conversion.
            throw new ToolCallException(exception.status + ": " + exception.getMessage());
        }
    }
}
