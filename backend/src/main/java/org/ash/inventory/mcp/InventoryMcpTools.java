package org.ash.inventory.mcp;

import io.quarkiverse.mcp.server.Tool;
import io.quarkiverse.mcp.server.ToolArg;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItem;
import org.ash.inventory.model.AssemblyItemId;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.InventoryPosition;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.StorageLocation;
import org.ash.inventory.model.UserAccount;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@ApplicationScoped
public class InventoryMcpTools {

    @Inject
    EntityManager em;

    // ==========================================
    // ITEM CRUD OPERATIONS
    // ==========================================

    @Tool(description = "Create a new catalog item with optional initial stock and location")
    @Transactional
    public InventoryMcpDtos.ItemDetailDto create_item(
            @ToolArg(description = "Item name", required = true) String name,
            @ToolArg(description = "Primary category (e.g. Weapons, Communications, Medical, Power, Consumables)", required = true) String category,
            @ToolArg(description = "SKU (auto-generated if omitted)", required = false) String sku,
            @ToolArg(description = "Item description", required = false) String description,
            @ToolArg(description = "Subcategory", required = false) String subcategory,
            @ToolArg(description = "Supplier name", required = false) String supplier,
            @ToolArg(description = "Whether the item is consumable (true/false, default false)", required = false) Boolean consumable,
            @ToolArg(description = "Initial stock quantity (default 0)", required = false) Integer amount,
            @ToolArg(description = "Minimum stock alert threshold (default 0)", required = false) Integer minStock,
            @ToolArg(description = "Unit value in currency (e.g. 29.99)", required = false) Double unitValue,
            @ToolArg(description = "UUID of default storage location", required = false) String storageLocationId,
            @ToolArg(description = "Specific bin / shelf / position details", required = false) String positionDetails,
            @ToolArg(description = "Handling or operational hint", required = false) String hint,
            @ToolArg(description = "Tracking mode: 'bulk', 'serialized', or 'lot_tracked' (default bulk)", required = false) String trackingMode,
            @ToolArg(description = "Inventory role: 'consumable', 'returnable', 'repairable', or 'rental'", required = false) String inventoryRole) {

        if (name == null || name.isBlank()) throw new IllegalArgumentException("Item name cannot be blank");
        if (category == null || category.isBlank()) throw new IllegalArgumentException("Item category cannot be blank");

        Item item = new Item();
        item.name = name.trim();
        item.category = category.trim();
        item.sku = (sku != null && !sku.isBlank()) ? sku.trim().toUpperCase(Locale.ROOT) : generateSku(item.name);
        item.description = description;
        item.subcategory = subcategory;
        item.supplier = supplier;
        item.consumable = Boolean.TRUE.equals(consumable);
        item.baseAmount = (amount != null && amount > 0) ? amount : 0;
        item.minStock = (minStock != null && minStock > 0) ? minStock : 0;
        if (unitValue != null && unitValue >= 0) {
            item.unitValueCents = BigDecimal.valueOf(unitValue).movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
        }

        if (trackingMode != null && !trackingMode.isBlank()) {
            item.trackingMode = DomainEnums.TrackingMode.valueOf(trackingMode.trim().toLowerCase(Locale.ROOT));
        } else {
            item.trackingMode = DomainEnums.TrackingMode.bulk;
        }

        if (inventoryRole != null && !inventoryRole.isBlank()) {
            item.inventoryRole = DomainEnums.InventoryRole.valueOf(inventoryRole.trim().toLowerCase(Locale.ROOT));
        } else {
            item.inventoryRole = item.consumable ? DomainEnums.InventoryRole.consumable : DomainEnums.InventoryRole.returnable;
        }

        if (storageLocationId != null && !storageLocationId.isBlank()) {
            item.storageLocation = em.find(StorageLocation.class, UUID.fromString(storageLocationId.trim()));
            item.returnLocation = item.storageLocation;
        }
        item.positionDetails = positionDetails;
        item.hint = hint;
        item.active = true;

        em.persist(item);

        // Initial stock setup
        if (item.baseAmount > 0) {
            UserAccount systemActor = findOrCreateSystemActor();
            InventoryPosition pos = new InventoryPosition();
            pos.item = item;
            pos.location = item.storageLocation;
            pos.quantityOnHand = item.baseAmount;
            em.persist(pos);

            StockTransaction tx = new StockTransaction();
            tx.item = item;
            tx.user = systemActor;
            tx.type = DomainEnums.TransactionType.added;
            tx.quantity = item.baseAmount;
            tx.reason = "Initial stock";
            tx.notes = "Created via MCP";
            tx.idempotencyKey = UUID.randomUUID();
            tx.occurredAt = Instant.now();
            tx.destinationLocation = item.storageLocation;
            tx.availabilityBefore = 0;
            tx.availabilityAfter = item.baseAmount;
            em.persist(tx);

            if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                for (int i = 1; i <= item.baseAmount; i++) {
                    AssetInstance asset = new AssetInstance();
                    asset.item = item;
                    asset.assetCode = String.format("%s-%03d", item.sku, i);
                    asset.availabilityStatus = DomainEnums.AssetState.available;
                    asset.conditionStatus = DomainEnums.ConditionStatus.good;
                    asset.serviceStatus = DomainEnums.MaintenanceStatus.certified;
                    asset.currentLocation = item.storageLocation;
                    asset.active = true;
                    em.persist(asset);
                }
            }
        }

        return toItemDetailDto(item);
    }

    @Tool(description = "Get detailed information for a specific item by its UUID")
    @Transactional
    public InventoryMcpDtos.ItemDetailDto get_item_details(
            @ToolArg(description = "UUID of the item", required = true) String itemId) {
        UUID id = UUID.fromString(itemId.trim());
        Item item = em.find(Item.class, id);
        if (item == null) {
            throw new IllegalArgumentException("Item not found with id: " + itemId);
        }
        return toItemDetailDto(item);
    }

    @Tool(description = "Search catalog items by name, SKU, or category with optional filtering")
    @Transactional
    public List<InventoryMcpDtos.ItemSummaryDto> search_items(
            @ToolArg(description = "Search keyword matching SKU, name, or category", required = false) String query,
            @ToolArg(description = "Filter by specific category", required = false) String category,
            @ToolArg(description = "Maximum results to return (default 20, max 100)", required = false) Integer limit) {
        int max = (limit == null || limit <= 0) ? 20 : Math.min(limit, 100);

        StringBuilder hql = new StringBuilder(
                "select distinct i from Item i left join fetch i.storageLocation where i.active = true");
        if (query != null && !query.isBlank()) {
            hql.append(" and (lower(i.name) like :q or lower(i.sku) like :q or lower(i.category) like :q)");
        }
        if (category != null && !category.isBlank()) {
            hql.append(" and lower(i.category) = :cat");
        }
        hql.append(" order by i.name asc");

        var q = em.createQuery(hql.toString(), Item.class);
        if (query != null && !query.isBlank()) {
            q.setParameter("q", "%" + query.trim().toLowerCase(Locale.ROOT) + "%");
        }
        if (category != null && !category.isBlank()) {
            q.setParameter("cat", category.trim().toLowerCase(Locale.ROOT));
        }
        q.setMaxResults(max);

        List<Item> items = q.getResultList();
        List<InventoryMcpDtos.ItemSummaryDto> dtos = new ArrayList<>(items.size());
        for (Item item : items) {
            String locName = item.storageLocation != null ? item.storageLocation.name : null;
            dtos.add(new InventoryMcpDtos.ItemSummaryDto(
                    item.id,
                    item.sku,
                    item.name,
                    item.category,
                    item.subcategory,
                    item.ownershipType != null ? item.ownershipType.name() : null,
                    item.trackingMode != null ? item.trackingMode.name() : null,
                    item.minStock,
                    item.baseAmount,
                    locName,
                    item.active
            ));
        }
        return dtos;
    }

    @Tool(description = "Update an existing catalog item's metadata, locations, or thresholds")
    @Transactional
    public InventoryMcpDtos.ItemDetailDto update_item(
            @ToolArg(description = "UUID of the item to update", required = true) String itemId,
            @ToolArg(description = "New item name", required = false) String name,
            @ToolArg(description = "New description", required = false) String description,
            @ToolArg(description = "New category", required = false) String category,
            @ToolArg(description = "New subcategory", required = false) String subcategory,
            @ToolArg(description = "New supplier", required = false) String supplier,
            @ToolArg(description = "New minimum stock threshold", required = false) Integer minStock,
            @ToolArg(description = "New unit value in major currency units", required = false) Double unitValue,
            @ToolArg(description = "New storage location UUID", required = false) String storageLocationId,
            @ToolArg(description = "New return location UUID", required = false) String returnLocationId,
            @ToolArg(description = "New position details", required = false) String positionDetails,
            @ToolArg(description = "New operational hint", required = false) String hint,
            @ToolArg(description = "Maintenance interval in days", required = false) Integer maintenanceIntervalDays,
            @ToolArg(description = "Consumable flag", required = false) Boolean consumable,
            @ToolArg(description = "Inventory role: 'consumable', 'returnable', 'repairable', or 'rental'", required = false) String inventoryRole) {

        UUID id = UUID.fromString(itemId.trim());
        Item item = em.find(Item.class, id);
        if (item == null) throw new IllegalArgumentException("Item not found with id: " + itemId);

        if (name != null && !name.isBlank()) item.name = name.trim();
        if (description != null) item.description = description;
        if (category != null && !category.isBlank()) item.category = category.trim();
        if (subcategory != null) item.subcategory = subcategory;
        if (supplier != null) item.supplier = supplier;
        if (minStock != null && minStock >= 0) item.minStock = minStock;
        if (unitValue != null && unitValue >= 0) {
            item.unitValueCents = BigDecimal.valueOf(unitValue).movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
        }
        if (storageLocationId != null) {
            item.storageLocation = storageLocationId.isBlank() ? null : em.find(StorageLocation.class, UUID.fromString(storageLocationId.trim()));
        }
        if (returnLocationId != null) {
            item.returnLocation = returnLocationId.isBlank() ? null : em.find(StorageLocation.class, UUID.fromString(returnLocationId.trim()));
        }
        if (positionDetails != null) item.positionDetails = positionDetails;
        if (hint != null) item.hint = hint;
        if (maintenanceIntervalDays != null && maintenanceIntervalDays > 0) item.maintenanceIntervalDays = maintenanceIntervalDays;
        if (consumable != null) item.consumable = consumable;
        if (inventoryRole != null && !inventoryRole.isBlank()) {
            item.inventoryRole = DomainEnums.InventoryRole.valueOf(inventoryRole.trim().toLowerCase(Locale.ROOT));
        }

        return toItemDetailDto(item);
    }

    @Tool(description = "Deactivate (retire) or permanently delete an item")
    @Transactional
    public InventoryMcpDtos.DeleteResultDto delete_item(
            @ToolArg(description = "UUID of the item to delete or retire", required = true) String itemId,
            @ToolArg(description = "If true and item has no transactions, permanently deletes entity; otherwise soft-deletes (retires) item (default false)", required = false) Boolean permanent) {
        UUID id = UUID.fromString(itemId.trim());
        Item item = em.find(Item.class, id);
        if (item == null) throw new IllegalArgumentException("Item not found with id: " + itemId);

        Long txCount = em.createQuery("select count(t) from StockTransaction t where t.item.id = :id", Long.class)
                .setParameter("id", id).getSingleResult();
        Long assetCount = em.createQuery("select count(a) from AssetInstance a where a.item.id = :id", Long.class)
                .setParameter("id", id).getSingleResult();

        if (Boolean.TRUE.equals(permanent) && txCount == 0 && assetCount == 0) {
            // Delete inventory positions first
            em.createQuery("delete from InventoryPosition p where p.item.id = :id").setParameter("id", id).executeUpdate();
            em.remove(item);
            return new InventoryMcpDtos.DeleteResultDto(true, "Item", id, "Item permanently deleted");
        } else {
            item.active = false;
            return new InventoryMcpDtos.DeleteResultDto(true, "Item", id, "Item retired and marked inactive (transaction history preserved)");
        }
    }

    // ==========================================
    // ASSEMBLY CRUD OPERATIONS
    // ==========================================

    @Tool(description = "Create a new assembly (kit/package composed of multiple catalog items)")
    @Transactional
    public InventoryMcpDtos.AssemblyDetailDto create_assembly(
            @ToolArg(description = "Assembly name", required = true) String name,
            @ToolArg(description = "Description of the kit", required = false) String description,
            @ToolArg(description = "Usage or packaging hint", required = false) String hint,
            @ToolArg(description = "Applicable event tags / game types", required = false) List<String> eventTypes,
            @ToolArg(description = "Component items mapping (key = item UUID string, value = integer quantity per assembly)", required = true) Map<String, Integer> itemQuantities) {

        if (name == null || name.isBlank()) throw new IllegalArgumentException("Assembly name cannot be blank");
        if (itemQuantities == null || itemQuantities.isEmpty()) throw new IllegalArgumentException("Assembly must have at least one component item");

        Assembly assembly = new Assembly();
        assembly.name = name.trim();
        assembly.description = description;
        assembly.hint = hint;
        assembly.eventTags = eventTypes != null ? new ArrayList<>(eventTypes) : new ArrayList<>();
        em.persist(assembly);

        for (var entry : itemQuantities.entrySet()) {
            UUID itemId = UUID.fromString(entry.getKey().trim());
            Item item = em.find(Item.class, itemId);
            if (item == null) throw new IllegalArgumentException("Component item not found: " + entry.getKey());
            int qty = (entry.getValue() != null && entry.getValue() > 0) ? entry.getValue() : 1;

            AssemblyItem ai = new AssemblyItem();
            ai.assembly = assembly;
            ai.item = item;
            ai.id = new AssemblyItemId(assembly.id, item.id);
            ai.quantity = qty;
            em.persist(ai);
        }

        return toAssemblyDetailDto(assembly);
    }

    @Tool(description = "Get assembly details and list of composed item components with quantities")
    @Transactional
    public InventoryMcpDtos.AssemblyDetailDto get_assembly_details(
            @ToolArg(description = "UUID of the assembly", required = true) String assemblyId) {
        UUID id = UUID.fromString(assemblyId.trim());
        Assembly assembly = em.find(Assembly.class, id);
        if (assembly == null) throw new IllegalArgumentException("Assembly not found with id: " + assemblyId);
        return toAssemblyDetailDto(assembly);
    }

    @Tool(description = "List all assemblies / equipment kits with component counts")
    @Transactional
    public List<InventoryMcpDtos.AssemblySummaryDto> list_assemblies(
            @ToolArg(description = "Optional filter by event tag", required = false) String eventTag) {
        List<Assembly> list = em.createQuery("from Assembly a order by a.name asc", Assembly.class).getResultList();
        List<InventoryMcpDtos.AssemblySummaryDto> dtos = new ArrayList<>();

        for (Assembly a : list) {
            if (eventTag != null && !eventTag.isBlank() && !a.eventTags.contains(eventTag.trim())) {
                continue;
            }
            Long count = em.createQuery("select count(ai) from AssemblyItem ai where ai.assembly.id = :id", Long.class)
                    .setParameter("id", a.id).getSingleResult();
            dtos.add(new InventoryMcpDtos.AssemblySummaryDto(
                    a.id,
                    a.name,
                    a.description,
                    a.hint,
                    a.eventTags != null ? List.copyOf(a.eventTags) : List.of(),
                    count != null ? count.intValue() : 0
            ));
        }
        return dtos;
    }

    @Tool(description = "Update an assembly's metadata and/or replace its component item composition")
    @Transactional
    public InventoryMcpDtos.AssemblyDetailDto update_assembly(
            @ToolArg(description = "UUID of the assembly to update", required = true) String assemblyId,
            @ToolArg(description = "New name", required = false) String name,
            @ToolArg(description = "New description", required = false) String description,
            @ToolArg(description = "New operational hint", required = false) String hint,
            @ToolArg(description = "New event tags", required = false) List<String> eventTypes,
            @ToolArg(description = "New component item quantities (if provided, replaces entire component set)", required = false) Map<String, Integer> itemQuantities) {

        UUID id = UUID.fromString(assemblyId.trim());
        Assembly assembly = em.find(Assembly.class, id);
        if (assembly == null) throw new IllegalArgumentException("Assembly not found with id: " + assemblyId);

        if (name != null && !name.isBlank()) assembly.name = name.trim();
        if (description != null) assembly.description = description;
        if (hint != null) assembly.hint = hint;
        if (eventTypes != null) assembly.eventTags = new ArrayList<>(eventTypes);

        if (itemQuantities != null) {
            // Delete existing components and rebuild
            em.createQuery("delete from AssemblyItem ai where ai.assembly.id = :aid")
                    .setParameter("aid", assembly.id).executeUpdate();

            for (var entry : itemQuantities.entrySet()) {
                UUID itemId = UUID.fromString(entry.getKey().trim());
                Item item = em.find(Item.class, itemId);
                if (item == null) throw new IllegalArgumentException("Component item not found: " + entry.getKey());
                int qty = (entry.getValue() != null && entry.getValue() > 0) ? entry.getValue() : 1;

                AssemblyItem ai = new AssemblyItem();
                ai.assembly = assembly;
                ai.item = item;
                ai.id = new AssemblyItemId(assembly.id, item.id);
                ai.quantity = qty;
                em.persist(ai);
            }
        }

        return toAssemblyDetailDto(assembly);
    }

    @Tool(description = "Delete an assembly and its component associations")
    @Transactional
    public InventoryMcpDtos.DeleteResultDto delete_assembly(
            @ToolArg(description = "UUID of the assembly to delete", required = true) String assemblyId) {
        UUID id = UUID.fromString(assemblyId.trim());
        Assembly assembly = em.find(Assembly.class, id);
        if (assembly == null) throw new IllegalArgumentException("Assembly not found with id: " + assemblyId);

        em.createQuery("delete from AssemblyItem ai where ai.assembly.id = :aid")
                .setParameter("aid", id).executeUpdate();
        em.remove(assembly);

        return new InventoryMcpDtos.DeleteResultDto(true, "Assembly", id, "Assembly successfully deleted");
    }

    // ==========================================
    // EVENT CRUD OPERATIONS
    // ==========================================

    @Tool(description = "Create a new airsoft event occurrence with optional planned equipment quotas")
    @Transactional
    public InventoryMcpDtos.EventOccurrenceDto create_event(
            @ToolArg(description = "Event code / type (e.g. MILSIM, CQB, PATROL, OP_NIGHTFALL)", required = true) String eventType,
            @ToolArg(description = "Full event title", required = true) String name,
            @ToolArg(description = "Start date in format YYYY-MM-DD", required = true) String startDate,
            @ToolArg(description = "End date in format YYYY-MM-DD (defaults to startDate if omitted)", required = false) String endDate,
            @ToolArg(description = "Event status: 'planned', 'active', 'completed', 'cancelled' (default 'planned')", required = false) String status,
            @ToolArg(description = "Event briefing notes", required = false) String notes,
            @ToolArg(description = "Initial planned item allocations (key = item UUID string, value = planned quantity)", required = false) Map<String, Integer> plannedQuantities) {

        if (eventType == null || eventType.isBlank()) throw new IllegalArgumentException("Event type cannot be blank");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Event name cannot be blank");
        if (startDate == null || startDate.isBlank()) throw new IllegalArgumentException("Start date cannot be blank");

        LocalDate start = LocalDate.parse(startDate.trim());
        LocalDate end = (endDate != null && !endDate.isBlank()) ? LocalDate.parse(endDate.trim()) : start;
        if (end.isBefore(start)) throw new IllegalArgumentException("End date cannot be before start date");

        EventOccurrence ev = new EventOccurrence();
        ev.eventType = eventType.trim().toUpperCase(Locale.ROOT);
        ev.name = name.trim();
        ev.startDate = start;
        ev.endDate = end;
        ev.status = (status != null && !status.isBlank()) ? status.trim().toLowerCase(Locale.ROOT) : "planned";
        ev.notes = notes;
        if (plannedQuantities != null) {
            ev.plannedQuantities = new LinkedHashMap<>(plannedQuantities);
        }
        em.persist(ev);

        return toEventDto(ev);
    }

    @Tool(description = "Get detailed information for a specific event by its UUID")
    @Transactional
    public InventoryMcpDtos.EventOccurrenceDto get_event_details(
            @ToolArg(description = "UUID of the event", required = true) String eventId) {
        UUID id = UUID.fromString(eventId.trim());
        EventOccurrence ev = em.find(EventOccurrence.class, id);
        if (ev == null) throw new IllegalArgumentException("Event not found with id: " + eventId);
        return toEventDto(ev);
    }

    @Tool(description = "List airsoft events and occurrences")
    @Transactional
    public List<InventoryMcpDtos.EventOccurrenceDto> list_events(
            @ToolArg(description = "Optional filter by event status (e.g. planned, active, completed)", required = false) String status) {
        String hql = "from EventOccurrence e";
        if (status != null && !status.isBlank()) {
            hql += " where lower(e.status) = :st";
        }
        hql += " order by e.startDate asc";

        var q = em.createQuery(hql, EventOccurrence.class);
        if (status != null && !status.isBlank()) {
            q.setParameter("st", status.trim().toLowerCase(Locale.ROOT));
        }
        q.setMaxResults(50);

        List<EventOccurrence> events = q.getResultList();
        List<InventoryMcpDtos.EventOccurrenceDto> dtos = new ArrayList<>(events.size());
        for (EventOccurrence ev : events) {
            dtos.add(toEventDto(ev));
        }
        return dtos;
    }

    @Tool(description = "Update an existing event's schedule, status, notes, or item quotas")
    @Transactional
    public InventoryMcpDtos.EventOccurrenceDto update_event(
            @ToolArg(description = "UUID of the event to update", required = true) String eventId,
            @ToolArg(description = "New event name", required = false) String name,
            @ToolArg(description = "New event type", required = false) String eventType,
            @ToolArg(description = "New start date YYYY-MM-DD", required = false) String startDate,
            @ToolArg(description = "New end date YYYY-MM-DD", required = false) String endDate,
            @ToolArg(description = "New status: 'planned', 'active', 'completed', 'cancelled'", required = false) String status,
            @ToolArg(description = "Updated briefing notes", required = false) String notes,
            @ToolArg(description = "Updated planned item allocations", required = false) Map<String, Integer> plannedQuantities,
            @ToolArg(description = "Updated used item quantities", required = false) Map<String, Integer> usedQuantities) {

        UUID id = UUID.fromString(eventId.trim());
        EventOccurrence ev = em.find(EventOccurrence.class, id);
        if (ev == null) throw new IllegalArgumentException("Event not found with id: " + eventId);

        if (name != null && !name.isBlank()) ev.name = name.trim();
        if (eventType != null && !eventType.isBlank()) ev.eventType = eventType.trim().toUpperCase(Locale.ROOT);
        if (startDate != null && !startDate.isBlank()) ev.startDate = LocalDate.parse(startDate.trim());
        if (endDate != null && !endDate.isBlank()) ev.endDate = LocalDate.parse(endDate.trim());
        if (ev.endDate.isBefore(ev.startDate)) throw new IllegalArgumentException("End date cannot be before start date");
        if (status != null && !status.isBlank()) ev.status = status.trim().toLowerCase(Locale.ROOT);
        if (notes != null) ev.notes = notes;
        if (plannedQuantities != null) ev.plannedQuantities = new LinkedHashMap<>(plannedQuantities);
        if (usedQuantities != null) ev.usedQuantities = new LinkedHashMap<>(usedQuantities);

        return toEventDto(ev);
    }

    @Tool(description = "Delete an event occurrence if no active orders are linked to it")
    @Transactional
    public InventoryMcpDtos.DeleteResultDto delete_event(
            @ToolArg(description = "UUID of the event to delete", required = true) String eventId) {
        UUID id = UUID.fromString(eventId.trim());
        EventOccurrence ev = em.find(EventOccurrence.class, id);
        if (ev == null) throw new IllegalArgumentException("Event not found with id: " + eventId);

        Long factionOrders = em.createQuery("select count(o) from FactionOrder o where o.eventOccurrence.id = :id", Long.class)
                .setParameter("id", id).getSingleResult();
        Long generalOrders = em.createQuery("select count(g) from GeneralOrder g where g.eventOccurrence.id = :id", Long.class)
                .setParameter("id", id).getSingleResult();

        if (factionOrders > 0 || generalOrders > 0) {
            throw new IllegalStateException("Event cannot be deleted because it has " + (factionOrders + generalOrders) + " linked orders");
        }

        em.remove(ev);
        return new InventoryMcpDtos.DeleteResultDto(true, "EventOccurrence", id, "Event successfully deleted");
    }

    // ==========================================
    // OTHER OPERATIONAL & QUERY TOOLS
    // ==========================================

    @Tool(description = "List active storage locations and warehouses")
    @Transactional
    public List<InventoryMcpDtos.LocationDto> list_storage_locations(
            @ToolArg(description = "Optional filter by warehouse ID", required = false) String warehouseId) {
        String hql = "from StorageLocation l left join fetch l.warehouse where l.active = true";
        if (warehouseId != null && !warehouseId.isBlank()) {
            hql += " and l.warehouse.id = :whId";
        }
        hql += " order by l.name asc";

        var query = em.createQuery(hql, StorageLocation.class);
        if (warehouseId != null && !warehouseId.isBlank()) {
            query.setParameter("whId", UUID.fromString(warehouseId.trim()));
        }

        List<StorageLocation> list = query.getResultList();
        List<InventoryMcpDtos.LocationDto> dtos = new ArrayList<>(list.size());
        for (StorageLocation loc : list) {
            String whName = loc.warehouse != null ? loc.warehouse.name : null;
            dtos.add(new InventoryMcpDtos.LocationDto(
                    loc.id,
                    loc.name,
                    loc.description,
                    loc.locationType != null ? loc.locationType.name() : null,
                    loc.area,
                    loc.location,
                    loc.position,
                    whName,
                    loc.latitude,
                    loc.longitude
            ));
        }
        return dtos;
    }

    @Tool(description = "Get inventory stock positions and available quantities for an item across all locations")
    @Transactional
    public List<InventoryMcpDtos.StockPositionDto> get_inventory_positions(
            @ToolArg(description = "UUID of the item to get stock positions for", required = true) String itemId) {
        UUID id = UUID.fromString(itemId.trim());
        List<InventoryPosition> positions = em.createQuery(
                "from InventoryPosition p left join fetch p.location left join fetch p.lot " +
                        "where p.item.id = :itemId order by p.location.name asc", InventoryPosition.class)
                .setParameter("itemId", id)
                .getResultList();

        List<InventoryMcpDtos.StockPositionDto> dtos = new ArrayList<>(positions.size());
        for (InventoryPosition pos : positions) {
            String locId = pos.location != null ? pos.location.id.toString() : null;
            String locName = pos.location != null ? pos.location.name : "Unknown";
            String lotNum = pos.lot != null ? pos.lot.lotNumber : null;
            String expDate = pos.lot != null && pos.lot.expiryDate != null ? pos.lot.expiryDate.toString() : null;

            dtos.add(new InventoryMcpDtos.StockPositionDto(
                    pos.id,
                    locId,
                    locName,
                    pos.quantityOnHand,
                    pos.quantityReserved,
                    pos.availableQuantity(),
                    pos.quantityInTransit,
                    lotNum,
                    expDate
            ));
        }
        return dtos;
    }

    @Tool(description = "List physical serialized asset instances (e.g. generators, tagged firearms, heavy equipment)")
    @Transactional
    public List<InventoryMcpDtos.AssetInstanceDto> list_asset_instances(
            @ToolArg(description = "Optional filter by item UUID", required = false) String itemId,
            @ToolArg(description = "Optional filter by availability status (e.g. available, reserved, in_repair, in_custody)", required = false) String status) {
        StringBuilder hql = new StringBuilder(
                "from AssetInstance a left join fetch a.currentLocation left join fetch a.currentCustodian where a.active = true");
        if (itemId != null && !itemId.isBlank()) {
            hql.append(" and a.item.id = :itemId");
        }
        if (status != null && !status.isBlank()) {
            hql.append(" and a.availabilityStatus = :status");
        }
        hql.append(" order by a.assetCode asc");

        var q = em.createQuery(hql.toString(), AssetInstance.class);
        if (itemId != null && !itemId.isBlank()) {
            q.setParameter("itemId", UUID.fromString(itemId.trim()));
        }
        if (status != null && !status.isBlank()) {
            q.setParameter("status", DomainEnums.AssetState.valueOf(status.trim().toLowerCase(Locale.ROOT)));
        }
        q.setMaxResults(100);

        List<AssetInstance> assets = q.getResultList();
        List<InventoryMcpDtos.AssetInstanceDto> dtos = new ArrayList<>(assets.size());
        for (AssetInstance a : assets) {
            String locName = a.currentLocation != null ? a.currentLocation.name : null;
            String custName = a.currentCustodian != null ? a.currentCustodian.name : null;

            dtos.add(new InventoryMcpDtos.AssetInstanceDto(
                    a.id,
                    a.assetCode,
                    a.serialNumber,
                    a.manufacturer,
                    a.model,
                    a.conditionStatus != null ? a.conditionStatus.name() : null,
                    a.availabilityStatus != null ? a.availabilityStatus.name() : null,
                    a.serviceStatus != null ? a.serviceStatus.name() : null,
                    locName,
                    custName,
                    a.notes
            ));
        }
        return dtos;
    }

    @Tool(description = "Check for items whose total stock level is below min_stock threshold")
    @Transactional
    public List<InventoryMcpDtos.LowStockAlertDto> check_low_stock_items(
            @ToolArg(description = "Optional deficit threshold buffer", required = false) Integer threshold) {
        int buffer = (threshold != null && threshold > 0) ? threshold : 0;

        List<Item> items = em.createQuery(
                "select i from Item i left join fetch i.storageLocation where i.active = true and i.minStock > 0",
                Item.class).getResultList();

        List<InventoryMcpDtos.LowStockAlertDto> alerts = new ArrayList<>();
        for (Item item : items) {
            List<InventoryPosition> positions = em.createQuery(
                    "from InventoryPosition p where p.item = :item", InventoryPosition.class)
                    .setParameter("item", item)
                    .getResultList();

            int onHand = 0;
            int available = 0;
            for (InventoryPosition p : positions) {
                onHand += p.quantityOnHand;
                available += p.availableQuantity();
            }

            if (onHand <= (item.minStock + buffer)) {
                String loc = item.storageLocation != null ? item.storageLocation.name : "Unassigned";
                alerts.add(new InventoryMcpDtos.LowStockAlertDto(
                        item.id,
                        item.sku,
                        item.name,
                        onHand,
                        available,
                        item.minStock,
                        item.minStock - onHand,
                        loc
                ));
            }
        }
        return alerts;
    }

    @Tool(description = "Get high-level operational summary metrics of the inventory")
    @Transactional
    public InventoryMcpDtos.OperationalMetricsDto get_operational_summary() {
        long items = em.createQuery("select count(i) from Item i where i.active = true", Long.class).getSingleResult();
        long assets = em.createQuery("select count(a) from AssetInstance a where a.active = true", Long.class).getSingleResult();
        long locations = em.createQuery("select count(l) from StorageLocation l where l.active = true", Long.class).getSingleResult();
        long upcomingEvents = em.createQuery(
                "select count(e) from EventOccurrence e where e.startDate >= :today", Long.class)
                .setParameter("today", LocalDate.now())
                .getSingleResult();
        long maintenanceAlerts = em.createQuery(
                "select count(a) from AssetInstance a where a.active = true and (" +
                        "a.serviceStatus in (:dueStatuses) or a.conditionStatus in (:damagedStatuses))", Long.class)
                .setParameter("dueStatuses", List.of(DomainEnums.MaintenanceStatus.due_soon, DomainEnums.MaintenanceStatus.overdue))
                .setParameter("damagedStatuses", List.of(DomainEnums.ConditionStatus.damaged, DomainEnums.ConditionStatus.unsafe))
                .getSingleResult();

        return new InventoryMcpDtos.OperationalMetricsDto(items, assets, locations, upcomingEvents, maintenanceAlerts);
    }

    @Tool(description = "Get maintenance alerts for items and assets requiring attention, repair, or inspection")
    @Transactional
    public List<InventoryMcpDtos.MaintenanceAlertDto> get_maintenance_alerts() {
        List<InventoryMcpDtos.MaintenanceAlertDto> alerts = new ArrayList<>();

        List<AssetInstance> assets = em.createQuery(
                "from AssetInstance a where a.active = true and (" +
                        "a.serviceStatus in (:dueStatuses) or a.conditionStatus in (:damagedStatuses))", AssetInstance.class)
                .setParameter("dueStatuses", List.of(DomainEnums.MaintenanceStatus.due_soon, DomainEnums.MaintenanceStatus.overdue))
                .setParameter("damagedStatuses", List.of(DomainEnums.ConditionStatus.damaged, DomainEnums.ConditionStatus.unsafe))
                .setMaxResults(50)
                .getResultList();

        for (AssetInstance a : assets) {
            String issue = (a.conditionStatus == DomainEnums.ConditionStatus.damaged || a.conditionStatus == DomainEnums.ConditionStatus.unsafe)
                    ? "Physical condition: " + a.conditionStatus
                    : "Maintenance service " + a.serviceStatus;
            alerts.add(new InventoryMcpDtos.MaintenanceAlertDto(
                    "SerializedAsset",
                    a.id,
                    a.assetCode,
                    (a.manufacturer != null ? a.manufacturer + " " : "") + (a.model != null ? a.model : "Asset"),
                    issue,
                    a.serviceStatus != null ? a.serviceStatus.name() : null,
                    null
            ));
        }

        LocalDate today = LocalDate.now();
        List<Item> items = em.createQuery(
                "from Item i where i.active = true and (i.nextMaintenanceDue <= :today or i.maintenanceStatus in (:dueStatuses))",
                Item.class)
                .setParameter("today", today)
                .setParameter("dueStatuses", List.of(DomainEnums.MaintenanceStatus.due_soon, DomainEnums.MaintenanceStatus.overdue))
                .setMaxResults(50)
                .getResultList();

        for (Item item : items) {
            alerts.add(new InventoryMcpDtos.MaintenanceAlertDto(
                    "CatalogItem",
                    item.id,
                    item.sku,
                    item.name,
                    "Item maintenance due",
                    item.maintenanceStatus != null ? item.maintenanceStatus.name() : null,
                    item.nextMaintenanceDue != null ? item.nextMaintenanceDue.toString() : null
            ));
        }

        return alerts;
    }

    // ==========================================
    // HELPER MAPPERS
    // ==========================================

    private InventoryMcpDtos.ItemDetailDto toItemDetailDto(Item item) {
        String storageLocId = item.storageLocation != null ? item.storageLocation.id.toString() : null;
        String storageLocName = item.storageLocation != null ? item.storageLocation.name : null;
        String returnLocName = item.returnLocation != null ? item.returnLocation.name : null;
        String nextDue = item.nextMaintenanceDue != null ? item.nextMaintenanceDue.toString() : null;

        return new InventoryMcpDtos.ItemDetailDto(
                item.id,
                item.sku,
                item.name,
                item.description,
                item.category,
                item.subcategory,
                item.supplier,
                item.ownershipType != null ? item.ownershipType.name() : null,
                item.ownerName,
                item.keeperName,
                item.trackingMode != null ? item.trackingMode.name() : null,
                item.inventoryRole != null ? item.inventoryRole.name() : null,
                item.minStock,
                item.baseAmount,
                item.unitValueCents,
                storageLocId,
                storageLocName,
                returnLocName,
                item.positionDetails,
                item.hint,
                item.maintenanceStatus != null ? item.maintenanceStatus.name() : null,
                nextDue,
                item.consumable,
                item.active
        );
    }

    private InventoryMcpDtos.AssemblyDetailDto toAssemblyDetailDto(Assembly assembly) {
        List<AssemblyItem> components = em.createQuery(
                "from AssemblyItem ai left join fetch ai.item where ai.assembly.id = :aid order by ai.item.name asc",
                AssemblyItem.class)
                .setParameter("aid", assembly.id)
                .getResultList();

        List<InventoryMcpDtos.AssemblyComponentDto> compDtos = new ArrayList<>(components.size());
        for (AssemblyItem ai : components) {
            compDtos.add(new InventoryMcpDtos.AssemblyComponentDto(
                    ai.item.id,
                    ai.item.sku,
                    ai.item.name,
                    ai.item.category,
                    ai.quantity
            ));
        }

        return new InventoryMcpDtos.AssemblyDetailDto(
                assembly.id,
                assembly.name,
                assembly.description,
                assembly.hint,
                assembly.eventTags != null ? List.copyOf(assembly.eventTags) : List.of(),
                compDtos
        );
    }

    private InventoryMcpDtos.EventOccurrenceDto toEventDto(EventOccurrence ev) {
        return new InventoryMcpDtos.EventOccurrenceDto(
                ev.id,
                ev.name,
                ev.eventType,
                ev.startDate != null ? ev.startDate.toString() : null,
                ev.endDate != null ? ev.endDate.toString() : null,
                ev.status,
                ev.notes,
                ev.plannedQuantities != null ? Map.copyOf(ev.plannedQuantities) : Map.of(),
                ev.usedQuantities != null ? Map.copyOf(ev.usedQuantities) : Map.of()
        );
    }

    private UserAccount findOrCreateSystemActor() {
        var existing = em.createQuery("from UserAccount u where u.role = :role", UserAccount.class)
                .setParameter("role", DomainEnums.UserRole.hq_admin)
                .setMaxResults(1)
                .getResultStream().findFirst().orElse(null);
        if (existing != null) return existing;

        UserAccount sys = new UserAccount();
        sys.externalSubject = "mcp-system-actor";
        sys.name = "MCP System Automation";
        sys.role = DomainEnums.UserRole.hq_admin;
        sys.factions = new ArrayList<>();
        em.persist(sys);
        return sys;
    }

    private String generateSku(String name) {
        String prefix = Normalizer.normalize(name, Normalizer.Form.NFKD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "").toUpperCase(Locale.ROOT);
        if (prefix.length() > 8) prefix = prefix.substring(0, 8);
        if (prefix.isBlank()) prefix = "ITEM";
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
    }
}
