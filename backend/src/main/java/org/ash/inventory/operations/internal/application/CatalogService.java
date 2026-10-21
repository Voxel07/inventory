package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.LifecycleDtos;
import org.ash.inventory.operations.internal.media.MediaService;
import org.ash.inventory.operations.internal.model.Assembly;
import org.ash.inventory.operations.internal.model.AssemblyItem;
import org.ash.inventory.operations.internal.model.AssemblyItemId;
import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.Faction;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.ItemImage;
import org.ash.inventory.operations.internal.model.RuntimeEntry;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.CatalogOrm;
import org.ash.inventory.operations.internal.persistence.CategoryMaintenanceOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.Inputs;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.inject.Inject;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@ApplicationScoped
public class CatalogService {
    @jakarta.inject.Inject CategoryMaintenanceService categoryDefaults;
    @Inject LocationHierarchyService hierarchy;
    @Inject InventoryAccessService accessPolicies;
    @Inject InventoryAccessInheritance inheritance;
    @jakarta.inject.Inject PositionService positions;
    @Inject org.ash.inventory.operations.internal.persistence.CategoryMaintenanceOrm categoryMaintenance;
    @Inject EventMetricsService eventMetrics;
    @Inject RuntimeService runtime;
    @Inject LifecycleService lifecycle;
    private final org.ash.inventory.operations.internal.media.MediaService media;
    private final ActorService actorService;
    private final CatalogOrm orm;
    private final DomainEventService events;

    public CatalogService(org.ash.inventory.operations.internal.media.MediaService media, ActorService actorService,
            CatalogOrm orm, DomainEventService events) {
        this.media = media;
        this.actorService = actorService;
        this.orm = orm;
        this.events = events;
    }

    public List<Item> getItems(String search, String category, int offset, int limit) {
        return getItems(org.ash.inventory.operations.internal.persistence.CatalogOrm.ItemFilter.search(search, category), offset, limit);
    }

    public List<Item> getItems(org.ash.inventory.operations.internal.persistence.CatalogOrm.ItemFilter filter, int offset, int limit) {
        actorService.current();
        return orm.items(filter, offset, limit);
    }

    public List<UUID> getVisibleItemIds() {
        var actor = actorService.current();
        return orm.visibleItemIds();
    }

    public List<String> getVisibleCategories() {
        var actor = actorService.current();
        return orm.categories();
    }

    public List<String> getVisibleItemNames(UUID locationId) {
        actorService.current();
        return orm.itemNames(locationId);
    }

    public Item getVisibleItem(UUID id) {
        var actor = actorService.current();
        var item = orm.find(Item.class, id);
        if (item == null || !item.active || !canView(item, actor)) throw ApiException.notFound("Item not found");
        return item;
    }

    public List<StorageLocation> getLocations(boolean includeInactive, String search, UUID subtreeId, int offset, int limit) {
        actorService.current();
        return orm.locations(includeInactive, search, subtreeId, offset, limit);
    }

    public record VisibleAssemblies(List<Assembly> assemblies, Map<UUID, List<AssemblyItem>> components) {}

    /** {@code mine}: private assemblies the actor owns. */
    public VisibleAssemblies getVisibleAssemblies(String search, String eventTag, boolean mine, int offset, int limit) {
        var actor = actorService.current();
        var values = orm.assemblies(search, eventTag, mine ? actor.id : null, offset, limit);
        return new VisibleAssemblies(values, orm.assemblyItems(values));
    }

    public boolean canViewItem(Item item) { return item.active && canView(item, actorService.current()); }

    public boolean canViewItem(Item item, org.ash.inventory.operations.internal.model.UserAccount actor) { return item.active && canView(item, actor); }

    public boolean canViewAssemblyComponents(List<AssemblyItem> components) {
        return canViewAssemblyComponents(components, actorService.current());
    }

    public boolean canViewAssemblyComponents(List<AssemblyItem> components, org.ash.inventory.operations.internal.model.UserAccount actor) {
        return components.stream().allMatch(component -> component.item.active && canView(component.item, actor));
    }

    /** A private assembly needs its own grant in addition to visible components. */
    public boolean canViewAssembly(Assembly assembly, List<AssemblyItem> components, org.ash.inventory.operations.internal.model.UserAccount actor) {
        return assembly.active && accessPolicies.projectionAllows(assembly.accessPolicy) && canViewAssemblyComponents(components, actor);
    }

    public List<AssemblyItem> getVisibleAssemblyComponents(Assembly assembly) {
        var components = orm.assemblyItems(assembly);
        if (!canViewAssembly(assembly, components, actorService.current())) throw ApiException.notFound("Assembly not found");
        return components;
    }

    public boolean canViewAssembly(Assembly assembly) {
        return assembly != null && canViewAssembly(assembly, orm.assemblyItems(assembly), actorService.current());
    }

    public List<EventOccurrence> getEvents(String eventType) {
        actorService.requireReader();
        return orm.events(eventType);
    }

    public List<Faction> getFactions(String eventType) {
        actorService.requireReader();
        return orm.factions(eventType);
    }

    @Transactional
    public List<String> eventTypes() {
        actorService.current();
        return List.copyOf(orm.eventTypes());
    }

    public <T> T find(Class<T> type, UUID id) {
        return orm.find(type, id);
    }

    /**
     * Bulk catalog save for imports: entries without an id are created, the others updated, and their asset codes
     * registered. All or nothing; a failure names the entry by its {@code index}, so the client can drop that row.
     */
    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public List<Item> saveItems(List<ApiModels.ItemBatchEntry> entries) {
        var saved = new ArrayList<Item>(entries.size());
        for (int index = 0; index < entries.size(); index++) {
            var entry = entries.get(index);
            var codes = entry.assetCodes() == null ? List.<String>of() : entry.assetCodes();
            try {
                if (!codes.isEmpty() && entry.item().amount() != null && entry.item().amount() > 0)
                    throw ApiException.badRequest("Use either an amount or asset codes, not both");
                var item = entry.id() == null ? createItem(entry.item()) : updateItem(entry.id(), entry.item());
                if (!codes.isEmpty()) registerAssetCodes(item, codes, entry.id() == null);
                // Surface constraint violations here, while the failing entry is still known.
                orm.flush();
                saved.add(item);
            } catch (ApiException e) {
                throw new ApiException(e.status, e.getMessage(), Map.of("index", index));
            } catch (jakarta.persistence.PersistenceException e) {
                throw new ApiException(409, "Item could not be saved because it conflicts with existing data", Map.of("index", index));
            }
        }
        return saved;
    }

    /** Registers explicit codes on a serialized item; codes the item already carries are skipped. */
    private void registerAssetCodes(Item item, List<String> codes, boolean newItem) {
        if (item.trackingMode != DomainEnums.TrackingMode.serialized)
            throw ApiException.badRequest("Asset instances can only be registered for serialized items");
        var known = new HashSet<String>();
        if (!newItem) for (var asset : orm.assetInstances(item)) known.add(asset.assetCode.toUpperCase(Locale.ROOT));
        int created = 0;
        for (var value : codes) {
            String code = value.trim().toUpperCase(Locale.ROOT);
            if (!known.add(code)) continue;
            if (orm.assetCodeExists(code)) throw ApiException.conflict("Asset code " + code + " already exists");
            var asset = new AssetInstance();
            asset.item = item;
            asset.assetCode = code;
            asset.availabilityStatus = DomainEnums.AssetState.available;
            asset.conditionStatus = DomainEnums.ConditionStatus.good;
            asset.currentLocation = item.storageLocation;
            asset.active = true;
            orm.persist(asset);
            created++;
        }
        if (created > 0) {
            categoryDefaults.apply(item);
            recordAssetRegistration(item, created);
        }
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Item createItem(ApiModels.ItemInput input) {
        actorService.requireInventoryCreation();
        if (Boolean.FALSE.equals(input.privateResource())) actorService.requireWarehouse();
        var item = new Item();
        boolean privateItem = Boolean.TRUE.equals(input.privateResource()) || !canManageInventory(actorService.current());
        if (input.storageLocation() != null) {
            var location = orm.require(StorageLocation.class, input.storageLocation(), "Location");
            privateItem |= location.accessPolicy != null;
        }
        if (privateItem) {
            item.accessPolicy = accessPolicies.create();
            item.ownershipType = Item.Ownership.private_owner; item.ownerName = actorService.current().name;
            item.availabilityPolicy = Item.AvailabilityPolicy.unavailable;
        } else actorService.requireWarehouse();
        apply(item, input);
        requireUniqueName(item);
        orm.persist(item);
        inheritance.refreshItem(item);
        bookMeterReading(item, input, "Opening meter reading");
        persistImages(item, input.images());
        int initialAmount = input.amount() == null ? 0 : input.amount();
        boolean codePattern = (input.assetCodePrefix() != null && !input.assetCodePrefix().isBlank()) || input.assetStartNumber() != null;
        if (codePattern && item.trackingMode != DomainEnums.TrackingMode.serialized)
            throw ApiException.badRequest("Asset code generation only applies to serialized items");
        if (item.trackingMode == DomainEnums.TrackingMode.serialized && initialAmount > 0) {
            String prefix = input.assetCodePrefix() != null && !input.assetCodePrefix().isBlank()
                    ? input.assetCodePrefix().trim().toUpperCase(Locale.ROOT) : item.sku + "-";
            int start = input.assetStartNumber() == null ? 1 : input.assetStartNumber();
            for (int i = start; i < start + initialAmount; i++) {
                String code = String.format("%s%03d", prefix, i);
                if (orm.assetCodeExists(code)) throw ApiException.conflict("Asset code " + code + " already exists");
                var asset = new AssetInstance();
                asset.item = item;
                asset.assetCode = code;
                asset.availabilityStatus = DomainEnums.AssetState.available;
                asset.conditionStatus = DomainEnums.ConditionStatus.good;
                asset.currentLocation = item.storageLocation;
                asset.active = true;
                orm.persist(asset);
            }
        }
        createSchedules(item, input.maintenanceSchedules());
        categoryDefaults.apply(item);
        if (initialAmount > 0) {
            var tx = new StockTransaction();
            tx.item = item;
            tx.user = actorService.current();
            tx.type = DomainEnums.TransactionType.added;
            tx.quantity = initialAmount;
            tx.reason = "Initial stock";
            tx.notes = "Initial stock on item creation";
            tx.idempotencyKey = UUID.randomUUID();
            tx.occurredAt = Instant.now();
            tx.destinationLocation = item.storageLocation;
            // Lot-less stock of a lot-tracked item is never available; opening stock forms the first lot.
            if (item.trackingMode == DomainEnums.TrackingMode.lot_tracked) {
                var lot = new InventoryLot();
                lot.item = item;
                lot.lotNumber = item.sku + "-L001";
                lot.bestBeforeDate = item.bestBeforeDate;
                lot.notes = "Initial stock on item creation";
                orm.persist(lot);
                tx.lot = lot;
            }
            tx.availabilityBefore = 0;
            tx.availabilityAfter = initialAmount;
            positions.apply(tx);
            orm.persist(tx);
        }
        catalogChanged("items", item.id);
        return item;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Item updateItem(UUID id, ApiModels.ItemInput input) {
        var item = orm.requireLocked(Item.class, id, "Item");
        actorService.requireItemEdit(item);
        if (input.amount() != null) {
            throw ApiException.badRequest("Stock cannot be edited on the item; create a stock adjustment instead");
        }
        if (input.maintenanceSchedules() != null && !input.maintenanceSchedules().isEmpty()) {
            throw ApiException.badRequest("Maintenance schedules of an existing item are managed through /api/maintenance-schedules");
        }
        var targetTrackingMode = input.trackingMode() != null ? input.trackingMode() : item.trackingMode;
        int targetDecimals = input.quantityDecimals() != null ? input.quantityDecimals() : item.quantityDecimals;
        if (targetTrackingMode != item.trackingMode || targetDecimals != item.quantityDecimals) {
            long assetCount = orm.countAssets(item);
            long txCount = orm.countTransactions(item);
            if (assetCount > 0 || txCount > 0) {
                throw ApiException.badRequest("Cannot change tracking mode or decimal places for an item with existing stock or transaction history");
            }
        }
        String previousCategory = item.category;
        String previousName = item.name;
        var previousLocation = item.storageLocation;
        apply(item, input);
        // Keeping name and location never conflicts, so items that predate the rule stay editable.
        if (!item.name.equalsIgnoreCase(previousName) || item.storageLocation != previousLocation) requireUniqueName(item);
        inheritance.refreshItem(item);
        if (!java.util.Objects.equals(previousCategory, item.category)) categoryDefaults.apply(item);
        bookMeterReading(item, input, "Meter reading corrected");
        if (input.images() != null) {
            var previousImages = orm.itemImages(item).stream().map(image -> image.objectKey).toList();
            orm.deleteItemImages(item);
            persistImages(item, input.images());
            var retainedImages = new HashSet<>(input.images());
            previousImages.stream()
                    .filter(image -> !retainedImages.contains(image))
                    .forEach(media::deleteAfterCommit);
        }
        catalogChanged("items", item.id);
        return item;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public void retireItem(UUID id) {
        var item = orm.requireLocked(Item.class, id, "Item");
        actorService.requireItemEdit(item);
        // Returns and order reconciliation only operate on active items; settle them before retirement.
        var obligations = orm.openObligations(item);
        if (!obligations.isEmpty())
            throw ApiException.conflict("Item cannot be retired while it has " + String.join(", ", obligations));
        item.active = false;
        catalogChanged("items", item.id);
    }

    private void apply(Item item, ApiModels.ItemInput input) {
        if (input.privateResource() != null && input.privateResource() != (item.accessPolicy != null))
            throw ApiException.badRequest("Privacy cannot be changed through catalog edits");
        // Single-spaced, so the duplicate check compares the same form the client does.
        item.name = input.name().trim().replaceAll("\\s+", " ");
        item.sku = resolveSku(item, input.sku());
        item.description = input.description();
        item.category = input.category().trim();
        item.subcategory = input.subcategory();
        item.supplier = input.supplier();
        item.eventTags = input.eventTypes() == null ? new ArrayList<>() : new ArrayList<>(input.eventTypes());
        item.trackingMode = input.trackingMode() == null
                ? (item.trackingMode != null ? item.trackingMode : DomainEnums.TrackingMode.bulk)
                : input.trackingMode();
        if (input.inventoryRole() != null) item.inventoryRole = input.inventoryRole();
        if (item.trackingMode == DomainEnums.TrackingMode.serialized
                && item.inventoryRole == DomainEnums.InventoryRole.consumable) {
            throw ApiException.badRequest("Serialized inventory cannot use the consumable role");
        }
        item.unit = org.ash.inventory.platform.api.Inputs.blankToNull(input.unit() == null ? null : input.unit().trim());
        if (input.quantityDecimals() != null) item.quantityDecimals = input.quantityDecimals();
        // Serialized units are counted one by one.
        if (item.trackingMode == DomainEnums.TrackingMode.serialized && item.quantityDecimals != 0)
            throw ApiException.badRequest("Serialized items are counted in whole units");
        if (input.minStock() != null) item.minStock = input.minStock();
        if (input.value() != null) item.unitValueCents = input.value().movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValueExact();
        item.storageLocation = input.storageLocation() == null ? null : orm.require(StorageLocation.class, input.storageLocation(), "Storage location");
        item.returnLocation = input.returnLocation() == null ? item.storageLocation
                : orm.require(StorageLocation.class, input.returnLocation(), "Return location");
        LocationHierarchyService.requireStockLocation(item.storageLocation);
        LocationHierarchyService.requireStockLocation(item.returnLocation);
        item.positionDetails = input.positionDetails();
        item.hint = input.hint();
        item.containerSize = input.containerSize();
        if (item.containerSize != null && item.trackingMode == DomainEnums.TrackingMode.serialized)
            throw ApiException.badRequest("Serialized items cannot be stored in bulk boxes");
        item.fuelConsumptionLitersPer100Km = input.fuelConsumptionLitersPer100Km();
        item.batteryReplacementDue = input.batteryReplacementDue();
        item.bestBeforeDate = input.bestBeforeDate();
        if (input.tracksRuntime() != null) item.tracksRuntime = input.tracksRuntime();
    }

    /** Item-wide plans entered on the creation form; same rules and permissions as the schedule endpoint. */
    private void createSchedules(Item item, List<ApiModels.ItemScheduleInput> schedules) {
        if (schedules == null) return;
        for (var schedule : schedules) {
            if (schedule.intervalType() == DomainEnums.MaintenanceIntervalType.operating_hours && !item.tracksRuntime)
                throw ApiException.badRequest("Operating-hour maintenance requires recording operating hours on return");
            lifecycle.createSchedule(new org.ash.inventory.operations.internal.contract.dto.LifecycleDtos.ScheduleInput(item.id, null,
                    schedule.maintenanceType(), schedule.intervalType(), schedule.intervalValue(),
                    schedule.nextDueAt(), schedule.nextDueValue(), schedule.warningWindow(),
                    null, null, schedule.checkoutBlocking(), true));
        }
    }

    /** The item meter only moves through the runtime log; a reading entered on the item form is a correction. */
    private void bookMeterReading(Item item, ApiModels.ItemInput input, String note) {
        if (input.currentOperatingHours() != null)
            runtime.record(item, null, input.currentOperatingHours(), null, null, RuntimeEntry.Source.correction, note);
    }

    public boolean managesInventory(UserAccount actor) { return canManageInventory(actor); }

    private boolean canManageInventory(UserAccount actor) {
        return actor.role.atLeast(DomainEnums.UserRole.warehouse_crew);
    }

    private boolean canView(Item item, UserAccount actor) {
        return actorService.canViewItem(item, actor);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public StorageLocation createLocation(ApiModels.StorageLocationInput input) {
        actorService.requireInventoryCreation();
        if (Boolean.FALSE.equals(input.privateResource())) actorService.requireWarehouse();
        hierarchy.lockHierarchy();
        var parent = parentLocation(input.parentLocationId());
        var location = newLocation(input.name(), Boolean.TRUE.equals(input.privateResource()) || (parent != null && parent.accessPolicy != null));
        apply(location, parent, input);
        inheritance.refreshLocationSubtree(location);
        catalogChanged("storage-locations", location.id);
        return location;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public StorageLocation updateLocation(UUID id, ApiModels.StorageLocationInput input) {
        hierarchy.lockHierarchy();
        var location = orm.requireLocked(StorageLocation.class, id, "Storage location");
        actorService.requireLocationEdit(location);
        if (Boolean.TRUE.equals(input.keepParent()) && input.parentLocationId() != null)
            throw ApiException.badRequest("Choose either keepParent or a new parent");
        apply(location, Boolean.TRUE.equals(input.keepParent()) ? location.parent : parentLocation(input.parentLocationId()), input);
        inheritance.refreshLocationSubtree(location);
        catalogChanged("storage-locations", location.id);
        return location;
    }

    /**
     * Creates or extends a top-level location with its sections and nested storage places in one step.
     * Nodes with an id are renamed in place, nodes without one are created under their parent;
     * locations missing from the input stay untouched (removal is deactivation).
     */
    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public List<StorageLocation> saveStructure(ApiModels.StorageStructureInput input) {
        LocationHierarchyService.validateStructure(input);
        hierarchy.lockHierarchy();
        StorageLocation root;
        if (input.id() == null) {
            actorService.requireInventoryCreation();
            if (Boolean.FALSE.equals(input.privateResource())) actorService.requireWarehouse();
            root = newLocation(input.name(), Boolean.TRUE.equals(input.privateResource()));
        } else {
            root = orm.requireLocked(StorageLocation.class, input.id(), "Storage location");
            actorService.requireLocationEdit(root);
            if (root.parent != null) throw ApiException.badRequest("Only top-level locations have sections");
            if (input.privateResource() != null && input.privateResource() != (root.accessPolicy != null))
                throw ApiException.badRequest("Privacy cannot be changed through location edits");
        }
        root.name = input.name().trim();
        root.description = input.description();
        hierarchy.apply(root, null, input.code(), null);
        saveNodes(root, input.sections());
        inheritance.refreshLocationSubtree(root);
        catalogChanged("storage-locations", root.id);
        return orm.locationsIn(hierarchy.subtreeIds(root.id)).stream().filter(actorService::canViewLocation).toList();
    }

    private void saveNodes(StorageLocation parent, List<ApiModels.StorageNodeInput> nodes) {
        if (nodes == null) return;
        for (var node : nodes) {
            StorageLocation location;
            if (node.id() == null) location = newLocation(node.name(), parent.accessPolicy != null);
            else {
                location = orm.requireLocked(StorageLocation.class, node.id(), "Storage location");
                actorService.requireLocationEdit(location);
                if (location.parent == null || !location.parent.id.equals(parent.id))
                    throw ApiException.badRequest("Location " + location.name + " is not inside " + parent.name);
            }
            location.name = node.name().trim();
            location.description = node.description();
            hierarchy.apply(location, parent, node.code(), null);
            // Grants flow down a private location tree, so it must not contain public sub-locations.
            if (parent.accessPolicy != null && location.accessPolicy == null)
                throw ApiException.badRequest("Sub-locations of a private location must be private");
            saveNodes(location, node.children());
        }
    }

    /** Members without inventory management, and everything inside a private location, are private. */
    private StorageLocation newLocation(String name, boolean privateResource) {
        var location = new StorageLocation();
        location.name = name.trim();
        if (privateResource || !canManageInventory(actorService.current())) location.accessPolicy = accessPolicies.create();
        else actorService.requireWarehouse();
        orm.persist(location);
        return location;
    }

    private StorageLocation parentLocation(UUID id) {
        if (id == null) return null;
        var parent = orm.find(StorageLocation.class, id);
        if (parent == null) throw ApiException.badRequest("Parent location not found");
        return parent;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public void deleteLocation(UUID id) {
        hierarchy.lockHierarchy();
        var location = orm.requireLocked(StorageLocation.class, id, "Storage location");
        actorService.requireLocationEdit(location);
        if (!location.active) throw ApiException.notFound("Storage location not found");
        hierarchy.deactivate(location);
        catalogChanged("storage-locations", location.id);
    }

    private void apply(StorageLocation target, StorageLocation parent, ApiModels.StorageLocationInput input) {
        if (input.privateResource() != null && input.privateResource() != (target.accessPolicy != null))
            throw ApiException.badRequest("Privacy cannot be changed through location edits");
        target.name = input.name().trim();
        target.description = input.description();
        target.latitude = input.latitude();
        target.longitude = input.longitude();
        target.mapZoom = input.mapZoom() == null ? 16 : input.mapZoom();
        target.mapOverlayUrl = input.mapOverlay() == null ? null : media.attachToLocation(input.mapOverlay(), target.id);
        target.overlayBounds = input.overlayBounds();
        hierarchy.apply(target, parent, input.code(), input.active());
        // Grants flow down a private location tree, so it must not contain public sub-locations.
        if (target.parent != null && target.parent.accessPolicy != null && target.accessPolicy == null)
            throw ApiException.badRequest("Sub-locations of a private location must be private");
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Assembly createAssembly(ApiModels.AssemblyInput input) {
        actorService.requireInventoryCreation();
        if (Boolean.FALSE.equals(input.privateResource())) actorService.requireWarehouse();
        var assembly = new Assembly();
        // Like items: members without inventory management create personal assemblies.
        if (Boolean.TRUE.equals(input.privateResource()) || !canManageInventory(actorService.current()))
            assembly.accessPolicy = accessPolicies.create();
        else actorService.requireWarehouse();
        apply(assembly, input);
        orm.persist(assembly);
        replaceComponents(assembly, input);
        applyAssemblyImage(assembly, input);
        catalogChanged("assemblies", assembly.id);
        return assembly;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Assembly updateAssembly(UUID id, ApiModels.AssemblyInput input) {
        var assembly = orm.requireLocked(Assembly.class, id, "Assembly");
        getVisibleAssemblyComponents(assembly);
        actorService.requireAssemblyEdit(assembly);
        apply(assembly, input);
        replaceComponents(assembly, input);
        applyAssemblyImage(assembly, input);
        catalogChanged("assemblies", assembly.id);
        return assembly;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public void retireAssembly(UUID id) {
        var assembly = orm.requireLocked(Assembly.class, id, "Assembly");
        getVisibleAssemblyComponents(assembly);
        actorService.requireAssemblyEdit(assembly);
        assembly.active = false;
        catalogChanged("assemblies", assembly.id);
    }

    private void apply(Assembly target, ApiModels.AssemblyInput input) {
        if (target.id != null && input.privateResource() != null && input.privateResource() != (target.accessPolicy != null))
            throw ApiException.badRequest("Privacy cannot be changed through catalog edits");
        target.name = input.name().trim();
        target.category = org.ash.inventory.platform.api.Inputs.blankToNull(input.category());
        target.subcategory = org.ash.inventory.platform.api.Inputs.blankToNull(input.subcategory());
        target.description = input.description();
        target.hint = input.hint();
        target.eventTags = input.eventTypes() == null ? new ArrayList<>() : new ArrayList<>(input.eventTypes());
    }

    private void applyAssemblyImage(Assembly target, ApiModels.AssemblyInput input) {
        String previousImage = target.imageObjectKey;
        if (input.image() != null && !input.image().isBlank()) {
            target.imageObjectKey = media.attachToAssembly(input.image(), target.id);
        } else if (input.removeImage()) {
            target.imageObjectKey = null;
        }
        if (previousImage != null && !Objects.equals(previousImage, target.imageObjectKey)) {
            media.deleteAfterCommit(previousImage);
        }
    }

    private void replaceComponents(Assembly assembly, ApiModels.AssemblyInput input) {
        var existing = orm.assemblyItems(assembly).stream().collect(
                java.util.stream.Collectors.toMap(component -> component.item.id, component -> component));
        for (var entry : input.itemQuantities().entrySet()) {
            if (entry.getValue() == null || entry.getValue() < 1) throw ApiException.badRequest("Assembly component quantities must be positive");
            var component = existing.remove(entry.getKey());
            if (component == null) {
                component = new AssemblyItem();
                component.assembly = assembly;
                component.item = orm.require(Item.class, entry.getKey(), "Item");
                component.id = new AssemblyItemId(assembly.id, component.item.id);
                orm.persist(component);
            }
            component.quantity = entry.getValue();
        }
        existing.values().forEach(orm::remove);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public EventOccurrence createEvent(ApiModels.EventInput input) {
        actorService.requireAdmin();
        return newEvent(input);
    }

    private EventOccurrence newEvent(ApiModels.EventInput input) {
        var event = new EventOccurrence();
        event.eventType = input.eventType().toUpperCase(Locale.ROOT);
        event.name = input.name() == null || input.name().isBlank() ? event.eventType + " " + input.startDate().getYear() : input.name();
        event.startDate = input.startDate();
        event.endDate = input.endDate() == null ? input.startDate() : input.endDate();
        if (event.endDate.isBefore(event.startDate)) throw ApiException.badRequest("Event end date cannot be before its start date");
        event.status = input.status() == null ? "planned" : input.status();
        event.notes = input.notes();
        event.orderDeadline = input.orderDeadline();
        if (input.plannedQuantities() != null) event.plannedQuantities = eventQuantities(input.plannedQuantities());
        if (input.usedQuantities() != null) event.usedQuantities = eventQuantities(input.usedQuantities());
        orm.persist(event);
        catalogChanged("events", event.id);
        return event;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public EventOccurrence updateEvent(UUID id, ApiModels.EventInput input) {
        actorService.requireAdmin();
        var event = orm.requireLocked(EventOccurrence.class, id, "Event occurrence");
        event.eventType = input.eventType().toUpperCase(Locale.ROOT);
        event.name = input.name() == null ? event.name : input.name();
        event.startDate = input.startDate();
        event.endDate = input.endDate() == null ? input.startDate() : input.endDate();
        if (event.endDate.isBefore(event.startDate)) throw ApiException.badRequest("Event end date cannot be before its start date");
        boolean closing = !event.closed() && "completed".equals(input.status());
        // Closing freezes the usage derived from orders; afterwards the report is corrected only explicitly.
        if (closing) event.usedQuantities = new LinkedHashMap<>(eventMetrics.summarize(event).used());
        event.status = input.status() == null ? event.status : input.status();
        event.notes = input.notes();
        event.orderDeadline = input.orderDeadline();
        if (input.plannedQuantities() != null) event.plannedQuantities = eventQuantities(input.plannedQuantities());
        if (input.usedQuantities() != null && event.closed()) event.usedQuantities = eventQuantities(input.usedQuantities());
        catalogChanged("events", event.id);
        return event;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public void deleteEvent(UUID id) {
        actorService.requireAdmin();
        var event = orm.requireLocked(EventOccurrence.class, id, "Event occurrence");
        if (orm.hasEventHistory(id)) {
            throw ApiException.conflict("Event cannot be deleted once orders, movements, returns or commitments reference it");
        }
        orm.deletePlanningOverrides(id);
        orm.remove(event);
        catalogChanged("events", id);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Faction createFaction(ApiModels.FactionInput input) {
        actorService.requireAdmin();
        return newFaction(input);
    }

    private Faction newFaction(ApiModels.FactionInput input) {
        var faction = new Faction();
        faction.eventType = input.eventType().toUpperCase(Locale.ROOT);
        faction.name = input.name().trim();
        faction.slug = input.slug() == null || input.slug().isBlank() ? slug(input.name()) : slug(input.slug());
        faction.active = input.active() == null || input.active();
        orm.persist(faction);
        catalogChanged("factions", faction.id);
        return faction;
    }

    /** Orders reference existing events; a missing one is created only through the admin-only catalog command. */
    public EventOccurrence eventForOrder(String eventType, LocalDate date) {
        var event = orm.findEvent(eventType.toUpperCase(Locale.ROOT), date);
        if (event != null) return event;
        if (!actorService.atLeast(DomainEnums.UserRole.admin)) throw ApiException.notFound("Event not found");
        return createEvent(new ApiModels.EventInput(eventType, eventType.toUpperCase(Locale.ROOT) + " " + date.getYear(), date, date, "planned", null, Map.of(), Map.of(), null));
    }

    private Map<String, Integer> eventQuantities(Map<UUID, Integer> quantities) {
        var result = new LinkedHashMap<String, Integer>();
        if (quantities == null) return result;
        quantities.forEach((itemId, quantity) -> {
            if (itemId == null || quantity == null || quantity < 0) {
                throw ApiException.badRequest("Event quantities must be non-negative");
            }
            if (quantity == 0) return;
            orm.require(Item.class, itemId, "Item");
            result.put(itemId.toString(), quantity);
        });
        return result;
    }

    /** Orders reference existing factions; a missing one is created only through the admin-only catalog command. */
    public Faction factionForOrder(String eventType, String name) {
        var faction = orm.findFaction(eventType.toUpperCase(Locale.ROOT), name.trim().toLowerCase(Locale.ROOT));
        if (faction != null) return faction;
        if (!actorService.atLeast(DomainEnums.UserRole.admin)) throw ApiException.notFound("Faction not found");
        return createFaction(new ApiModels.FactionInput(eventType, name.trim(), slug(name), true));
    }

    /** Item names are unique per storage location among the active items the actor can see; retired items free their name. */
    private void requireUniqueName(Item item) {
        if (orm.itemNameTaken(item.name, item.storageLocation == null ? null : item.storageLocation.id, item.id))
            throw ApiException.conflict("An item named " + item.name + " already exists at this storage location");
    }

    private void persistImages(Item item, List<String> images) {
        if (images == null) return;
        if (images.size() > 8) throw ApiException.badRequest("An item can have at most 8 images");
        int order = 0;
        for (String objectKey : images) {
            if (objectKey == null || objectKey.isBlank()) continue;
            var image = new ItemImage();
            image.item = item;
            image.objectKey = media.attachToItem(objectKey, item.id);
            image.displayOrder = order++;
            orm.persist(image);
        }
    }

    public List<AssetInstance> getAssets(UUID itemId) {
        var item = getVisibleItem(itemId);
        return orm.assetInstances(item);
    }

    public List<AssetInstance> getAssets(UUID itemId, int offset, int limit) {
        var item = getVisibleItem(itemId);
        return orm.assetInstances(item, offset, limit);
    }

    public List<AssetInstance> getAssets(UUID itemId, DomainEnums.AssetState status, int offset, int limit) {
        return orm.assetInstances(getVisibleItem(itemId), status, offset, limit);
    }

    public AssetInstance getAssetByCode(String code) {
        var asset = orm.findAssetByCode(code);
        if (asset == null || !canView(asset.item, actorService.current())) throw ApiException.notFound("Asset not found");
        return asset;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public AssetInstance createAsset(UUID itemId, ApiModels.AssetInstanceInput input) {
        var item = orm.requireLocked(Item.class, itemId, "Item");
        actorService.requireItemEdit(item);
        if (item.trackingMode != DomainEnums.TrackingMode.serialized) {
            throw ApiException.badRequest("Asset instances can only be registered for serialized items");
        }
        if (input.availabilityStatus() != null && input.availabilityStatus() != DomainEnums.AssetState.available) {
            throw ApiException.badRequest("New assets must start in the available state");
        }
        if (input.currentCustodianId() != null) {
            throw ApiException.badRequest("Custody can only be assigned through a checkout or handover workflow");
        }
        if (input.operatingHours() != null && !item.tracksRuntime)
            throw ApiException.badRequest("This item does not record operating hours");
        var asset = new AssetInstance();
        asset.item = item;
        String code = input.assetCode();
        if (code == null || code.isBlank()) code = nextFreeAssetCode(item.sku + "-", orm.countAssets(item) + 1);
        else if (orm.assetCodeExists(code)) throw ApiException.conflict("Asset code " + code.trim() + " already exists");
        asset.assetCode = code.trim().toUpperCase(Locale.ROOT);
        asset.serialNumber = input.serialNumber();
        asset.manufacturer = input.manufacturer();
        asset.model = input.model();
        asset.conditionStatus = input.conditionStatus() == null ? DomainEnums.ConditionStatus.good : input.conditionStatus();
        asset.availabilityStatus = DomainEnums.AssetState.available;
        asset.currentLocation = input.currentLocationId() == null ? item.storageLocation : orm.require(StorageLocation.class, input.currentLocationId(), "Storage location");
        LocationHierarchyService.requireStockLocation(asset.currentLocation);
        if (input.operatingHours() != null) asset.operatingHours = input.operatingHours();
        asset.purchaseDate = input.purchaseDate();
        asset.purchasePriceCents = cents(input.purchasePrice());
        asset.replacementValueCents = cents(input.replacementValue());
        asset.notes = input.notes();
        asset.active = true;
        orm.persist(asset);
        categoryDefaults.apply(asset.item);
        recordAssetRegistration(item, 1);
        return asset;
    }

    /** First unused {@code prefix + NNN} at or after {@code from}; write-offs and re-codes leave gaps and holes. */
    private String nextFreeAssetCode(String prefix, long from) {
        long number = Math.max(1, from);
        String code;
        while (orm.assetCodeExists(code = String.format("%s%03d", prefix, number))) number++;
        return code;
    }

    /**
     * Renames existing units in the given order to {@code prefix + NNN} from {@code startNumber}. Units keep their
     * identity, history and stock; only a code held by a unit outside this set is a conflict.
     */
    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public List<AssetInstance> recodeAssets(UUID itemId, ApiModels.AssetRecodeInput input) {
        var item = orm.requireLocked(Item.class, itemId, "Item");
        actorService.requireItemEdit(item);
        if (item.trackingMode != DomainEnums.TrackingMode.serialized)
            throw ApiException.badRequest("Asset codes only exist on serialized items");
        var assets = ownedActiveAssets(item, input.assetIds());
        var ids = new HashSet<UUID>();
        assets.forEach(asset -> ids.add(asset.id));
        String prefix = input.codePrefix().trim().toUpperCase(Locale.ROOT);
        var codes = new ArrayList<String>(assets.size());
        for (int i = 0; i < assets.size(); i++) {
            String code = String.format("%s%03d", prefix, (long) input.startNumber() + i);
            var holder = orm.assetWithCode(code);
            if (holder != null && !ids.contains(holder.id)) throw ApiException.conflict("Asset code " + code + " already exists");
            codes.add(code);
        }
        // Units may swap codes within the set; park them on unique placeholders so the unique index never sees a duplicate.
        for (var asset : assets) asset.assetCode = "~RECODE-" + asset.id;
        orm.flush();
        for (int i = 0; i < assets.size(); i++) {
            var asset = assets.get(i);
            asset.assetCode = codes.get(i);
            events.record("asset.updated", "asset", asset.id, actorService.current().id, null,
                    Map.of("itemId", item.id.toString(), "assetCode", asset.assetCode));
        }
        orm.flush();
        catalogChanged("items", item.id);
        return assets;
    }

    /** Writes off several units of one item; all or nothing. */
    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public void writeOffAssets(UUID itemId, List<UUID> assetIds) {
        var item = orm.requireLocked(Item.class, itemId, "Item");
        if (item.accessPolicy == null) actorService.requireAdmin(); else actorService.requireItemEdit(item);
        for (var asset : ownedActiveAssets(item, assetIds)) writeOff(item, asset);
        catalogChanged("items", item.id);
    }

    private List<AssetInstance> ownedActiveAssets(Item item, List<UUID> assetIds) {
        var assets = new ArrayList<AssetInstance>(assetIds.size());
        var seen = new HashSet<UUID>();
        for (var id : assetIds) {
            if (!seen.add(id)) throw ApiException.badRequest("Asset " + id + " is listed twice");
            var asset = orm.requireLocked(AssetInstance.class, id, "Asset");
            assertOwnedActiveAsset(item, asset);
            assets.add(asset);
        }
        return assets;
    }

    private void recordAssetRegistration(Item item, int count) {
        var tx = new StockTransaction();
        tx.item = item;
        tx.user = actorService.current();
        tx.type = DomainEnums.TransactionType.added;
        tx.quantity = count;
        tx.reason = "Asset registration";
        tx.notes = "Added " + count + " serialized asset(s)";
        tx.idempotencyKey = UUID.randomUUID();
        tx.occurredAt = Instant.now();
        orm.persist(tx);

        catalogChanged("items", item.id);
        events.record("asset.created", "item", item.id, actorService.current().id, null,
                Map.of("itemId", item.id.toString(), "count", count));
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public AssetInstance updateAsset(UUID itemId, UUID assetId, ApiModels.AssetInstanceInput input) {
        var item = orm.requireLocked(Item.class, itemId, "Item");
        actorService.requireItemEdit(item);
        var asset = orm.requireLocked(AssetInstance.class, assetId, "Asset");
        if (!asset.item.id.equals(item.id)) throw ApiException.badRequest("Asset does not belong to item");
        assertExpectedVersion(asset, input.expectedVersion());
        if (input.availabilityStatus() != null && input.availabilityStatus() != asset.availabilityStatus) {
            throw ApiException.badRequest("Asset availability can only be changed through a lifecycle command");
        }
        if (input.conditionStatus() != null && input.conditionStatus() != asset.conditionStatus) {
            throw ApiException.badRequest("Asset condition can only be changed through a condition command");
        }
        if (input.currentLocationId() != null
                && (asset.currentLocation == null || !input.currentLocationId().equals(asset.currentLocation.id))) {
            throw ApiException.badRequest("Asset location can only be changed through the relocation command");
        }
        if (input.currentCustodianId() != null
                && (asset.currentCustodian == null || !input.currentCustodianId().equals(asset.currentCustodian.id))) {
            throw ApiException.badRequest("Asset custody can only be changed through a handover workflow");
        }
        if (input.assetCode() != null && !input.assetCode().isBlank() && !input.assetCode().equalsIgnoreCase(asset.assetCode)) {
            if (orm.assetCodeExists(input.assetCode())) throw ApiException.conflict("Asset code already exists");
            asset.assetCode = input.assetCode().trim().toUpperCase(Locale.ROOT);
        }
        if (input.serialNumber() != null) asset.serialNumber = org.ash.inventory.platform.api.Inputs.blankToNull(input.serialNumber());
        if (input.manufacturer() != null) asset.manufacturer = org.ash.inventory.platform.api.Inputs.blankToNull(input.manufacturer());
        if (input.model() != null) asset.model = org.ash.inventory.platform.api.Inputs.blankToNull(input.model());
        if (input.purchaseDate() != null) asset.purchaseDate = input.purchaseDate();
        if (input.purchasePrice() != null) asset.purchasePriceCents = cents(input.purchasePrice());
        if (input.replacementValue() != null) asset.replacementValueCents = cents(input.replacementValue());
        // Editing the meter is a correction; regular hours are booked per event through the runtime log.
        var meter = asset.operatingHours == null ? java.math.BigDecimal.ZERO : asset.operatingHours;
        if (input.operatingHours() != null && !item.tracksRuntime && input.operatingHours().compareTo(meter) != 0)
            throw ApiException.badRequest("This item does not record operating hours");
        if (input.operatingHours() != null)
            runtime.record(item, asset, input.operatingHours(), null, null, RuntimeEntry.Source.correction, "Meter reading corrected");
        if (input.notes() != null) asset.notes = input.notes();
        catalogChanged("items", item.id);
        events.record("asset.updated", "asset", asset.id, actorService.current().id, null,
                Map.of("itemId", item.id.toString(), "assetCode", asset.assetCode));
        orm.flush();
        return asset;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public void deleteAsset(UUID itemId, UUID assetId) {
        var item = orm.requireLocked(Item.class, itemId, "Item");
        if (item.accessPolicy == null) actorService.requireAdmin(); else actorService.requireItemEdit(item);
        var asset = orm.requireLocked(AssetInstance.class, assetId, "Asset");
        if (!asset.item.id.equals(item.id)) throw ApiException.badRequest("Asset does not belong to item");
        if (!asset.active) return;
        writeOff(item, asset);
        catalogChanged("items", item.id);
    }

    private void writeOff(Item item, AssetInstance asset) {
        if (asset.availabilityStatus == DomainEnums.AssetState.reserved
                || asset.availabilityStatus == DomainEnums.AssetState.staged
                || asset.availabilityStatus == DomainEnums.AssetState.in_custody
                || asset.availabilityStatus == DomainEnums.AssetState.in_field) {
            throw ApiException.conflict("Asset " + asset.assetCode + " must be released from reservations and custody before write-off");
        }
        var actor = actorService.current();
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.assetInstance = asset;
        transaction.user = actor;
        transaction.type = DomainEnums.TransactionType.written_off;
        transaction.quantity = 1;
        transaction.sourceLocation = asset.currentLocation;
        transaction.reason = "Asset write-off";
        transaction.notes = "Retired asset " + asset.assetCode;
        transaction.idempotencyKey = UUID.randomUUID();
        orm.persist(transaction);
        asset.availabilityStatus = DomainEnums.AssetState.written_off;
        asset.active = false;
        events.record("asset.written_off", "asset", asset.id, actor.id, transaction.idempotencyKey,
                Map.of("itemId", item.id.toString(), "assetCode", asset.assetCode));
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public AssetInstance relocateAsset(UUID itemId, UUID assetId, ApiModels.AssetRelocationInput input) {
        var item = orm.requireLocked(Item.class, itemId, "Item");
        actorService.requireItemEdit(item);
        var asset = orm.requireLocked(AssetInstance.class, assetId, "Asset");
        assertOwnedActiveAsset(item, asset);
        assertExpectedVersion(asset, input.expectedVersion());
        if (asset.availabilityStatus != DomainEnums.AssetState.available
                && asset.availabilityStatus != DomainEnums.AssetState.damaged
                && asset.availabilityStatus != DomainEnums.AssetState.in_repair
                && asset.availabilityStatus != DomainEnums.AssetState.in_maintenance) {
            throw ApiException.conflict("Asset cannot be relocated while it is " + asset.availabilityStatus);
        }
        var destination = orm.require(StorageLocation.class, input.locationId(), "Storage location");
        LocationHierarchyService.requireStockLocation(destination);
        if (asset.currentLocation != null && asset.currentLocation.id.equals(destination.id)) return asset;
        var actor = actorService.current();
        var transaction = new StockTransaction();
        transaction.item = item;
        transaction.assetInstance = asset;
        transaction.user = actor;
        transaction.type = DomainEnums.TransactionType.adjusted;
        transaction.quantity = 1;
        transaction.sourceLocation = asset.currentLocation;
        transaction.destinationLocation = destination;
        transaction.reason = "Asset relocation";
        transaction.notes = input.notes();
        transaction.idempotencyKey = UUID.randomUUID();
        orm.persist(transaction);
        asset.currentLocation = destination;
        events.record("asset.relocated", "asset", asset.id, actor.id, transaction.idempotencyKey,
                Map.of("itemId", item.id.toString(), "locationId", destination.id.toString()));
        orm.flush();
        return asset;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public AssetInstance updateAssetCondition(UUID itemId, UUID assetId, ApiModels.AssetConditionInput input) {
        var item = orm.requireLocked(Item.class, itemId, "Item");
        if (item.accessPolicy == null) actorService.requireWarehouse(); else actorService.requireItemEdit(item);
        var asset = orm.requireLocked(AssetInstance.class, assetId, "Asset");
        assertOwnedActiveAsset(item, asset);
        assertExpectedVersion(asset, input.expectedVersion());
        if (input.conditionStatus() == DomainEnums.ConditionStatus.lost) {
            throw ApiException.badRequest("Lost assets must be recorded through custody reconciliation");
        }
        var actor = actorService.current();
        var previous = asset.conditionStatus;
        asset.conditionStatus = input.conditionStatus();
        asset.availabilityStatus = StockPolicy.conditionedState(asset);
        events.record("asset.condition_changed", "asset", asset.id, actor.id, null,
                Map.of("itemId", item.id.toString(), "from", previous.name(), "to", input.conditionStatus().name()));
        orm.flush();
        return asset;
    }

    private static Integer cents(java.math.BigDecimal value) {
        return value == null ? null : value.movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValueExact();
    }

    private void assertOwnedActiveAsset(Item item, AssetInstance asset) {
        if (!asset.item.id.equals(item.id) || !asset.active) throw ApiException.notFound("Asset not found for item");
    }

    private void assertExpectedVersion(AssetInstance asset, Long expectedVersion) {
        if (expectedVersion == null) throw ApiException.badRequest("expectedVersion is required");
        if (asset.version != expectedVersion) {
            throw ApiException.conflict("Asset version conflict; current version is " + asset.version
                    + " and current state is " + asset.availabilityStatus);
        }
    }

    /** A blank SKU keeps the current one (or generates one on creation); an explicit SKU must be unused. */
    private String resolveSku(Item item, String requested) {
        if (requested == null || requested.isBlank()) return item.sku != null ? item.sku : generateSku(item.name);
        String sku = requested.trim().toUpperCase(Locale.ROOT);
        if (!sku.equals(item.sku) && orm.skuExists(sku)) throw ApiException.conflict("SKU " + sku + " already exists");
        return sku;
    }

    private String generateSku(String name) {
        String prefix = slug(name).replace("-", "").toUpperCase(Locale.ROOT);
        if (prefix.length() > 8) prefix = prefix.substring(0, 8);
        if (prefix.isEmpty()) prefix = "ITEM";
        // Items sharing a name prefix share the SKU namespace; retry the rare random collision.
        String sku;
        do sku = prefix + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
        while (orm.skuExists(sku));
        return sku;
    }

    private void catalogChanged(String resource, UUID id) {
        events.record("catalog.changed", resource, id, actorService.current().id, null,
                Map.of("resource", resource, "id", id.toString()));
    }

    private String slug(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

}
