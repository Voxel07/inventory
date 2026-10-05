package org.ash.inventory.mcp;

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

    @Blocking
    @Tool(description = "Create an item using the REST ItemInput contract. Manager access required; initial stock uses the canonical ledger and asset/position rules.")
    public ApiResponses.ItemResponse create_item(
            @ToolArg(description = "ItemInput: name/category required; value is decimal currency, locations are UUIDs; optional amount initializes stock", required = true) ApiModels.ItemInput input) {
        return call(() -> service.createItem(input));
    }

    @Blocking
    @Tool(description = "Read an active, visible item with canonical stock availability and metadata")
    public ApiResponses.ItemResponse get_item_details(
            @ToolArg(description = "Item UUID", required = true) UUID itemId) {
        return call(() -> service.item(itemId));
    }

    @Blocking
    @Tool(description = "Search active items visible to the caller, with exact optional category and bounded pagination")
    public List<ApiResponses.ItemResponse> search_items(
            @ToolArg(description = "Name, SKU or category search", required = false) String query,
            @ToolArg(description = "Exact category", required = false) String category,
            @ToolArg(description = "Results per page, 1–100; default 20", required = false) Integer limit,
            @ToolArg(description = "Zero-based page; default 0", required = false) Integer page) {
        return call(() -> service.items(query, category, page, limit));
    }

    @Blocking
    @Tool(description = "Replace item metadata using the REST ItemInput contract. Manager access required; name/category and current visibility assignments must be supplied. Stock changes require a stock command.")
    public ApiResponses.ItemResponse update_item(
            @ToolArg(description = "Item UUID", required = true) UUID itemId,
            @ToolArg(description = "Complete ItemInput metadata, with REST update semantics", required = true) ApiModels.ItemInput input) {
        return call(() -> service.updateItem(itemId, input));
    }

    @Blocking
    @Tool(description = "Retire an item while preserving ledger and custody history. Manager access required.")
    public InventoryMcpDtos.DeleteResultDto delete_item(
            @ToolArg(description = "Item UUID", required = true) UUID itemId) {
        return call(() -> service.retireItem(itemId));
    }

    @Blocking
    @Tool(description = "Create a kit using the REST AssemblyInput contract. Managers create shared kits; privateResource=true (or a non-manager caller) creates a personal kit. Component quantities must be positive.")
    public ApiResponses.AssemblyResponse create_assembly(
            @ToolArg(description = "AssemblyInput: name and itemQuantities (item UUID to quantity) required", required = true) ApiModels.AssemblyInput input) {
        return call(() -> service.createAssembly(input));
    }

    @Blocking
    @Tool(description = "Read an assembly only when every active component is visible to the caller")
    public ApiResponses.AssemblyResponse get_assembly_details(
            @ToolArg(description = "Assembly UUID", required = true) UUID assemblyId) {
        return call(() -> service.assembly(assemblyId));
    }

    @Blocking
    @Tool(description = "List assemblies whose active components are all visible to the caller")
    public List<ApiResponses.AssemblyResponse> list_assemblies(
            @ToolArg(description = "Optional event tag", required = false) String eventTag) {
        return call(() -> service.assemblies(eventTag));
    }

    @Blocking
    @Tool(description = "Replace assembly metadata and composition using REST AssemblyInput. Managers edit shared kits; owners and editors edit personal kits.")
    public ApiResponses.AssemblyResponse update_assembly(
            @ToolArg(description = "Assembly UUID", required = true) UUID assemblyId,
            @ToolArg(description = "AssemblyInput: name and complete itemQuantities required", required = true) ApiModels.AssemblyInput input) {
        return call(() -> service.updateAssembly(assemblyId, input));
    }

    @Blocking
    @Tool(description = "Delete an assembly through the shared catalog command. Managers delete shared kits; owners and editors delete personal kits.")
    public InventoryMcpDtos.DeleteResultDto delete_assembly(
            @ToolArg(description = "Assembly UUID", required = true) UUID assemblyId) {
        return call(() -> service.deleteAssembly(assemblyId));
    }

    @Blocking
    @Tool(description = "Create an event using REST EventInput. Planner access required; item quotas must refer to visible items.")
    public ApiResponses.EventResponse create_event(
            @ToolArg(description = "EventInput: eventType and startDate (YYYY-MM-DD) required; optional name/endDate/status/notes/plannedQuantities/usedQuantities", required = true) ApiModels.EventInput input) {
        return call(() -> service.createEvent(input));
    }

    @Blocking
    @Tool(description = "Read an event with canonical deployment metrics; item IDs, names and quantities are scoped to the caller")
    public ApiResponses.EventResponse get_event_details(
            @ToolArg(description = "Event UUID", required = true) UUID eventId) {
        return call(() -> service.event(eventId));
    }

    @Blocking
    @Tool(description = "List up to 50 events in start-date order, with scoped item metrics")
    public List<ApiResponses.EventResponse> list_events(
            @ToolArg(description = "Optional event status", required = false) String status) {
        return call(() -> service.events(status));
    }

    @Blocking
    @Tool(description = "Update an event using REST EventInput, including eventType/startDate. Planner access required; supplied quotas must refer to visible items.")
    public ApiResponses.EventResponse update_event(
            @ToolArg(description = "Event UUID", required = true) UUID eventId,
            @ToolArg(description = "EventInput with REST update semantics", required = true) ApiModels.EventInput input) {
        return call(() -> service.updateEvent(eventId, input));
    }

    @Blocking
    @Tool(description = "Delete an event only when no faction, general or purchase orders are linked. Planner access required.")
    public InventoryMcpDtos.DeleteResultDto delete_event(
            @ToolArg(description = "Event UUID", required = true) UUID eventId) {
        return call(() -> service.deleteEvent(eventId));
    }

    @Blocking
    @Tool(description = "List active storage locations and warehouses")
    public List<ApiResponses.StorageLocationResponse> list_storage_locations(
            @ToolArg(description = "Optional warehouse UUID", required = false) UUID warehouseId) {
        return call(() -> service.locations(warehouseId));
    }

    @Blocking
    @Tool(description = "Read bulk/lot positions for a visible item, including command reservations, lot/damage/quarantine, maintenance and contributor holds. Serialized items return no positions; use assets and item stock.")
    public List<InventoryMcpDtos.StockPositionDto> get_inventory_positions(
            @ToolArg(description = "Item UUID", required = true) UUID itemId) {
        return call(() -> service.positions(itemId));
    }

    @Blocking
    @Tool(description = "List active serialized assets of a visible item with location, custody and service metadata")
    public List<ApiResponses.AssetInstanceResponse> list_asset_instances(
            @ToolArg(description = "Item UUID", required = true) UUID itemId,
            @ToolArg(description = "Optional availability state", required = false) DomainEnums.AssetState status,
            @ToolArg(description = "Zero-based page; default 0", required = false) Integer page,
            @ToolArg(description = "Results per page, 1–100; default 20", required = false) Integer limit) {
        return call(() -> service.assets(itemId, status, page, limit));
    }

    @Blocking
    @Tool(description = "List visible items with usable availability at or below minStock plus buffer. Includes serialized assets, reservations and maintenance/consent holds; deficit is max(0, minStock minus available).")
    public List<InventoryMcpDtos.LowStockAlertDto> check_low_stock_items(
            @ToolArg(description = "Non-negative threshold buffer; default 0", required = false) Integer threshold) {
        return call(() -> service.lowStock(threshold));
    }

    @Blocking
    @Tool(description = "Summarize visible active items, their serialized assets and maintenance alerts, plus shared active locations and upcoming non-cancelled events")
    public InventoryMcpDtos.OperationalMetricsDto get_operational_summary() {
        return call(() -> service.summary());
    }

    @Blocking
    @Tool(description = "Read visible active item/asset maintenance alerts, including calendar, hours and usage schedules evaluated with canonical policy; unknown meter evidence is an alert")
    public List<InventoryMcpDtos.MaintenanceAlertDto> get_maintenance_alerts() {
        return call(() -> service.maintenanceAlerts());
    }
    private <T> T call(Supplier<T> action) {
        try { return action.get(); }
        catch (ApiException exception) {
            // The transactional service has already rolled back before conversion.
            throw new ToolCallException(exception.status + ": " + exception.getMessage());
        }
    }
}
