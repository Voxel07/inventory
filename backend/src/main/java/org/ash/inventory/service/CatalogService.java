package org.ash.inventory.service;

import io.quarkus.cache.CacheInvalidateAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.CatalogOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;

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
    @Inject EntityManager entityManager;
    private final org.ash.inventory.helper.storage.MediaService media;
    private final ActorService actorService;
    private final CatalogOrm orm;
    private final DomainEventService events;

    public CatalogService(org.ash.inventory.helper.storage.MediaService media, ActorService actorService,
            CatalogOrm orm, DomainEventService events) {
        this.media = media;
        this.actorService = actorService;
        this.orm = orm;
        this.events = events;
    }

    public List<Item> getItems(String search, int offset, int limit) {
        var actor = actorService.current();
        return orm.items(search, actor.id, actor.factions, canManageInventory(actor), offset, limit);
    }

    public Item getVisibleItem(UUID id) {
        var actor = actorService.current();
        var item = orm.find(Item.class, id);
        if (item == null || !item.active || !canView(item, actor)) throw ApiException.notFound("Item not found");
        return item;
    }

    public List<StorageLocation> getLocations() {
        return orm.locations();
    }

    public List<Assembly> getAssemblies() {
        return orm.assemblies();
    }

    public List<EventOccurrence> getEvents(String eventType) {
        return orm.events(eventType);
    }

    public List<Faction> getFactions(String eventType) {
        return orm.factions(eventType);
    }

    public <T> T find(Class<T> type, UUID id) {
        return orm.find(type, id);
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public Item createItem(ApiModels.ItemInput input) {
        var item = new Item();
        apply(item, input);
        orm.persist(item);
        persistImages(item, input.images());
        if (item.trackingMode == DomainEnums.TrackingMode.serialized && item.baseAmount > 0) {
            for (int i = 1; i <= item.baseAmount; i++) {
                var asset = new AssetInstance();
                asset.item = item;
                asset.assetCode = String.format("%s-%03d", item.sku, i);
                asset.availabilityStatus = DomainEnums.AssetState.available;
                asset.conditionStatus = DomainEnums.ConditionStatus.good;
                asset.serviceStatus = DomainEnums.MaintenanceStatus.certified;
                asset.currentLocation = item.storageLocation;
                asset.active = true;
                orm.persist(asset);
            }
        }
        if (item.baseAmount > 0) {
            var tx = new StockTransaction();
            tx.item = item;
            tx.user = actorService.current();
            tx.type = DomainEnums.TransactionType.added;
            tx.quantity = item.baseAmount;
            tx.reason = "Initial stock";
            tx.notes = "Initial stock on item creation";
            tx.idempotencyKey = UUID.randomUUID();
            tx.occurredAt = Instant.now();
            tx.availabilityBefore = 0;
            tx.availabilityAfter = item.baseAmount;
            orm.persist(tx);
        }
        catalogChanged("items", item.id);
        return item;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public Item updateItem(UUID id, ApiModels.ItemInput input) {
        var item = locked(Item.class, id, "Item");
        if (input.amount() != null && input.amount() != item.baseAmount) {
            throw ApiException.badRequest("Existing stock cannot be edited on the item; create a stock adjustment instead");
        }
        var targetTrackingMode = input.trackingMode() != null ? input.trackingMode() : item.trackingMode;
        if (targetTrackingMode != item.trackingMode) {
            long assetCount = orm.countAssets(item);
            long txCount = orm.countTransactions(item);
            if (item.baseAmount > 0 || assetCount > 0 || txCount > 0) {
                throw ApiException.badRequest("Cannot change tracking mode for an item with existing stock or transaction history");
            }
        }
        apply(item, input);
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
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public void retireItem(UUID id) {
        var item = locked(Item.class, id, "Item");
        item.active = false;
        catalogChanged("items", item.id);
    }

    private void apply(Item item, ApiModels.ItemInput input) {
        item.name = input.name().trim();
        item.sku = input.sku() == null || input.sku().isBlank() ? generateSku(item.name) : input.sku().trim().toUpperCase(Locale.ROOT);
        item.description = input.description();
        item.category = input.category().trim();
        item.subcategory = input.subcategory();
        item.supplier = input.supplier();
        item.visibilityScope = input.visibilityScope() == null
                ? DomainEnums.ItemVisibilityScope.global : input.visibilityScope();
        item.assignedUser = input.assignedUserId() == null ? null
                : required(UserAccount.class, input.assignedUserId(), "Assigned user");
        item.assignedGroup = blankToNull(input.assignedGroup());
        if (item.visibilityScope == DomainEnums.ItemVisibilityScope.person && item.assignedUser == null) {
            throw ApiException.badRequest("Person-scoped items require an assigned user");
        }
        if (item.visibilityScope == DomainEnums.ItemVisibilityScope.group && item.assignedGroup == null) {
            throw ApiException.badRequest("Group-scoped items require an assigned group");
        }
        if (item.visibilityScope == DomainEnums.ItemVisibilityScope.event
                && (input.eventTypes() == null || input.eventTypes().isEmpty())) {
            throw ApiException.badRequest("Event-scoped items require at least one event type");
        }
        if (item.visibilityScope != DomainEnums.ItemVisibilityScope.person) item.assignedUser = null;
        if (item.visibilityScope != DomainEnums.ItemVisibilityScope.group) item.assignedGroup = null;
        item.eventTags = input.eventTypes() == null ? new ArrayList<>() : new ArrayList<>(input.eventTypes());
        item.consumable = input.consumable();
        item.trackingMode = input.trackingMode() == null
                ? (item.trackingMode != null ? item.trackingMode : DomainEnums.TrackingMode.bulk)
                : input.trackingMode();
        item.inventoryRole = input.inventoryRole() == null
                ? (input.consumable() ? DomainEnums.InventoryRole.consumable : DomainEnums.InventoryRole.returnable)
                : input.inventoryRole();
        if (item.trackingMode == DomainEnums.TrackingMode.serialized
                && item.inventoryRole == DomainEnums.InventoryRole.consumable) {
            throw ApiException.badRequest("Serialized inventory cannot use the consumable role");
        }
        if (input.amount() != null) item.baseAmount = input.amount();
        if (input.minStock() != null) item.minStock = input.minStock();
        if (input.value() != null) item.unitValueCents = input.value().movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValueExact();
        item.storageLocation = input.storageLocation() == null ? null : required(StorageLocation.class, input.storageLocation(), "Storage location");
        item.returnLocation = input.returnLocation() == null ? item.storageLocation
                : required(StorageLocation.class, input.returnLocation(), "Return location");
        item.positionDetails = input.positionDetails();
        item.hint = input.hint();
        item.containerSize = input.containerSize();
        item.containerCount = input.containerCount();
        item.containersOpened = input.containersOpened();
        item.containerRemainingPercent = input.containerRemainingPercent();
        item.maintenanceIntervalDays = input.maintenanceIntervalDays();
        item.nextMaintenanceDue = input.nextMaintenanceDue();
        var categoryPolicy = entityManager.createQuery("select p from CategoryMaintenancePolicy p where lower(p.category) = lower(:category)", CategoryMaintenancePolicy.class)
                .setParameter("category", item.category).getResultList();
        if (!categoryPolicy.isEmpty()) {
            item.maintenanceIntervalDays = categoryPolicy.getFirst().intervalDays;
            if (item.nextMaintenanceDue == null) item.nextMaintenanceDue = LocalDate.now().plusDays(item.maintenanceIntervalDays);
        }
        if (input.currentOperatingHours() != null) item.currentOperatingHours = input.currentOperatingHours();
        item.fuelConsumptionLitersPer100Km = input.fuelConsumptionLitersPer100Km();
        item.batteryReplacementDue = input.batteryReplacementDue();
        item.bestBeforeDate = input.bestBeforeDate();
        if (input.maintenanceStatus() != null) item.maintenanceStatus = input.maintenanceStatus();
    }

    private boolean canManageInventory(UserAccount actor) {
        return actor.role == DomainEnums.UserRole.hq_admin || actor.role == DomainEnums.UserRole.warehouse_crew;
    }

    private boolean canView(Item item, UserAccount actor) {
        if (canManageInventory(actor) || item.visibilityScope == null
                || item.visibilityScope == DomainEnums.ItemVisibilityScope.global
                || item.visibilityScope == DomainEnums.ItemVisibilityScope.event) return true;
        if (item.visibilityScope == DomainEnums.ItemVisibilityScope.person) {
            return item.assignedUser != null && item.assignedUser.id.equals(actor.id);
        }
        return item.assignedGroup != null && actor.factions.contains(item.assignedGroup);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "locations-cache")
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public StorageLocation createLocation(ApiModels.StorageLocationInput input) {
        var location = new StorageLocation();
        apply(location, input);
        orm.persist(location);
        catalogChanged("storage-locations", location.id);
        return location;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "locations-cache")
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public StorageLocation updateLocation(UUID id, ApiModels.StorageLocationInput input) {
        var location = locked(StorageLocation.class, id, "Storage location");
        apply(location, input);
        catalogChanged("storage-locations", location.id);
        return location;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "locations-cache")
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public void deleteLocation(UUID id) {
        var location = locked(StorageLocation.class, id, "Storage location");
        if (!location.active) throw ApiException.notFound("Storage location not found");
        orm.clearActiveLocationAssignments(location);
        location.active = false;
        catalogChanged("storage-locations", location.id);
    }

    private void apply(StorageLocation target, ApiModels.StorageLocationInput input) {
        target.name = input.name().trim();
        target.locationType = input.locationType() == null ? DomainEnums.LocationType.bin : input.locationType();
        target.description = input.description();
        target.area = input.area();
        target.location = input.location();
        target.position = input.position();
        target.latitude = input.latitude();
        target.longitude = input.longitude();
        target.mapZoom = input.mapZoom() == null ? 16 : input.mapZoom();
        target.mapOverlayUrl = input.mapOverlay();
        target.overlayBounds = input.overlayBounds();
        target.warehouse = input.warehouseId() == null ? null : required(Warehouse.class, input.warehouseId(), "Warehouse");
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public Assembly createAssembly(ApiModels.AssemblyInput input) {
        var assembly = new Assembly();
        apply(assembly, input);
        orm.persist(assembly);
        replaceComponents(assembly, input);
        applyAssemblyImage(assembly, input);
        catalogChanged("assemblies", assembly.id);
        return assembly;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public Assembly updateAssembly(UUID id, ApiModels.AssemblyInput input) {
        var assembly = locked(Assembly.class, id, "Assembly");
        apply(assembly, input);
        orm.deleteAssemblyItems(assembly);
        replaceComponents(assembly, input);
        applyAssemblyImage(assembly, input);
        catalogChanged("assemblies", assembly.id);
        return assembly;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "assemblies-cache")
    public void deleteAssembly(UUID id) {
        var assembly = locked(Assembly.class, id, "Assembly");
        if (assembly.imageObjectKey != null) media.deleteAfterCommit(assembly.imageObjectKey);
        orm.deleteAssemblyItems(assembly);
        orm.remove(assembly);
        catalogChanged("assemblies", assembly.id);
    }

    private void apply(Assembly target, ApiModels.AssemblyInput input) {
        target.name = input.name().trim();
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
        for (var entry : input.itemQuantities().entrySet()) {
            if (entry.getValue() == null || entry.getValue() < 1) throw ApiException.badRequest("Assembly component quantities must be positive");
            var component = new AssemblyItem();
            component.assembly = assembly;
            component.item = required(Item.class, entry.getKey(), "Item");
            component.id = new AssemblyItemId(assembly.id, component.item.id);
            component.quantity = entry.getValue();
            orm.persist(component);
        }
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "events-cache")
    public EventOccurrence createEvent(ApiModels.EventInput input) {
        var event = new EventOccurrence();
        event.eventType = input.eventType().toUpperCase(Locale.ROOT);
        event.name = input.name() == null || input.name().isBlank() ? event.eventType + " " + input.startDate().getYear() : input.name();
        event.startDate = input.startDate();
        event.endDate = input.endDate() == null ? input.startDate() : input.endDate();
        if (event.endDate.isBefore(event.startDate)) throw ApiException.badRequest("Event end date cannot be before its start date");
        event.status = input.status() == null ? "planned" : input.status();
        event.notes = input.notes();
        if (input.plannedQuantities() != null) event.plannedQuantities = eventQuantities(input.plannedQuantities());
        if (input.usedQuantities() != null) event.usedQuantities = eventQuantities(input.usedQuantities());
        orm.persist(event);
        catalogChanged("events", event.id);
        return event;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "events-cache")
    public EventOccurrence updateEvent(UUID id, ApiModels.EventInput input) {
        var event = locked(EventOccurrence.class, id, "Event occurrence");
        event.eventType = input.eventType().toUpperCase(Locale.ROOT);
        event.name = input.name() == null ? event.name : input.name();
        event.startDate = input.startDate();
        event.endDate = input.endDate() == null ? input.startDate() : input.endDate();
        event.status = input.status() == null ? event.status : input.status();
        event.notes = input.notes();
        if (input.plannedQuantities() != null) event.plannedQuantities = eventQuantities(input.plannedQuantities());
        if (input.usedQuantities() != null) event.usedQuantities = eventQuantities(input.usedQuantities());
        catalogChanged("events", event.id);
        return event;
    }

    @Transactional
    @CacheInvalidateAll(cacheName = "factions-cache")
    public Faction createFaction(ApiModels.FactionInput input) {
        var faction = new Faction();
        faction.eventType = input.eventType().toUpperCase(Locale.ROOT);
        faction.name = input.name().trim();
        faction.slug = input.slug() == null || input.slug().isBlank() ? slug(input.name()) : slug(input.slug());
        faction.active = input.active() == null || input.active();
        orm.persist(faction);
        catalogChanged("factions", faction.id);
        return faction;
    }

    public EventOccurrence findOrCreateEvent(String eventType, LocalDate date) {
        var event = orm.findEvent(eventType.toUpperCase(Locale.ROOT), date);
        if (event != null) return event;
        return createEvent(new ApiModels.EventInput(eventType, eventType.toUpperCase(Locale.ROOT) + " " + date.getYear(), date, date, "planned", null, Map.of(), Map.of()));
    }

    private Map<String, Integer> eventQuantities(Map<UUID, Integer> quantities) {
        var result = new LinkedHashMap<String, Integer>();
        if (quantities == null) return result;
        quantities.forEach((itemId, quantity) -> {
            if (itemId == null || quantity == null || quantity < 0) {
                throw ApiException.badRequest("Event quantities must be non-negative");
            }
            if (quantity == 0) return;
            required(Item.class, itemId, "Item");
            result.put(itemId.toString(), quantity);
        });
        return result;
    }

    public Faction findOrCreateFaction(String eventType, String name) {
        var faction = orm.findFaction(eventType.toUpperCase(Locale.ROOT), name.toLowerCase(Locale.ROOT));
        if (faction != null) return faction;
        return createFaction(new ApiModels.FactionInput(eventType, name, slug(name), true));
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

    public AssetInstance getAssetByCode(String code) {
        var asset = orm.findAssetByCode(code);
        if (asset == null || !canView(asset.item, actorService.current())) throw ApiException.notFound("Asset not found");
        return asset;
    }

    @Transactional
    public List<AssetInstance> createAssets(UUID itemId, ApiModels.AssetInstanceInput input) {
        var item = locked(Item.class, itemId, "Item");
        if (item.trackingMode != DomainEnums.TrackingMode.serialized) {
            throw ApiException.badRequest("Asset instances can only be registered for serialized items");
        }
        if (input.availabilityStatus() != null && input.availabilityStatus() != DomainEnums.AssetState.available) {
            throw ApiException.badRequest("New assets must start in the available state");
        }
        if (input.currentCustodianId() != null) {
            throw ApiException.badRequest("Custody can only be assigned through a checkout or handover workflow");
        }
        var created = new ArrayList<AssetInstance>();
        int batchCount = input.batchCount() != null && input.batchCount() > 1 ? input.batchCount() : 1;
        String prefix = input.codePrefix() != null && !input.codePrefix().isBlank() ? input.codePrefix().trim() : item.sku + "-";
        int startNum = input.startNumber() != null && input.startNumber() > 0 ? input.startNumber() : 1;

        if (batchCount > 1) {
            long existingCount = orm.countAssets(item);
            int currentSeq = Math.max(startNum, (int) existingCount + 1);
            for (int i = 0; i < batchCount; i++) {
                var asset = new AssetInstance();
                asset.item = item;
                String code = String.format("%s%03d", prefix, currentSeq + i);
                if (orm.assetCodeExists(code)) {
                    code = String.format("%s%03d-%s", prefix, currentSeq + i, UUID.randomUUID().toString().substring(0, 4).toUpperCase(Locale.ROOT));
                }
                asset.assetCode = code;
                asset.conditionStatus = input.conditionStatus() == null ? DomainEnums.ConditionStatus.good : input.conditionStatus();
                asset.availabilityStatus = input.availabilityStatus() == null ? DomainEnums.AssetState.available : input.availabilityStatus();
                asset.serviceStatus = DomainEnums.MaintenanceStatus.certified;
                asset.currentLocation = input.currentLocationId() == null ? item.storageLocation : required(StorageLocation.class, input.currentLocationId(), "Storage location");
                asset.active = true;
                orm.persist(asset);
                created.add(asset);
            }
        } else {
            var asset = new AssetInstance();
            asset.item = item;
            String code = input.assetCode();
            if (code == null || code.isBlank()) {
                long existingCount = orm.countAssets(item);
                code = String.format("%s%03d", prefix, existingCount + 1);
                if (orm.assetCodeExists(code)) {
                    code = String.format("%s%03d-%s", prefix, existingCount + 1, UUID.randomUUID().toString().substring(0, 4).toUpperCase(Locale.ROOT));
                }
            } else if (orm.assetCodeExists(code)) {
                throw ApiException.conflict("Asset code " + code + " already exists");
            }
            asset.assetCode = code.trim().toUpperCase(Locale.ROOT);
            asset.serialNumber = input.serialNumber();
            asset.manufacturer = input.manufacturer();
            asset.model = input.model();
            asset.conditionStatus = input.conditionStatus() == null ? DomainEnums.ConditionStatus.good : input.conditionStatus();
            asset.availabilityStatus = input.availabilityStatus() == null ? DomainEnums.AssetState.available : input.availabilityStatus();
            asset.serviceStatus = DomainEnums.MaintenanceStatus.certified;
            asset.currentLocation = input.currentLocationId() == null ? item.storageLocation : required(StorageLocation.class, input.currentLocationId(), "Storage location");
            if (input.currentCustodianId() != null) {
                asset.currentCustodian = required(UserAccount.class, input.currentCustodianId(), "User");
            }
            if (input.operatingHours() != null) asset.operatingHours = input.operatingHours();
            asset.notes = input.notes();
            asset.active = true;
            orm.persist(asset);
            created.add(asset);
        }

        var tx = new StockTransaction();
        tx.item = item;
        tx.user = actorService.current();
        tx.type = DomainEnums.TransactionType.added;
        tx.quantity = created.size();
        tx.reason = "Asset registration";
        tx.notes = "Added " + created.size() + " serialized asset(s)";
        tx.idempotencyKey = UUID.randomUUID();
        tx.occurredAt = Instant.now();
        orm.persist(tx);

        catalogChanged("items", item.id);
        events.record("asset.created", "item", item.id, actorService.current().id, null,
                Map.of("itemId", item.id.toString(), "count", created.size()));
        return created;
    }

    @Transactional
    public AssetInstance updateAsset(UUID itemId, UUID assetId, ApiModels.AssetInstanceInput input) {
        var item = locked(Item.class, itemId, "Item");
        var asset = locked(AssetInstance.class, assetId, "Asset");
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
        if (input.serialNumber() != null) asset.serialNumber = input.serialNumber().trim();
        if (input.operatingHours() != null) asset.operatingHours = input.operatingHours();
        if (input.notes() != null) asset.notes = input.notes();
        catalogChanged("items", item.id);
        events.record("asset.updated", "asset", asset.id, actorService.current().id, null,
                Map.of("itemId", item.id.toString(), "assetCode", asset.assetCode));
        return asset;
    }

    @Transactional
    public void deleteAsset(UUID itemId, UUID assetId) {
        var item = locked(Item.class, itemId, "Item");
        var asset = locked(AssetInstance.class, assetId, "Asset");
        if (!asset.item.id.equals(item.id)) throw ApiException.badRequest("Asset does not belong to item");
        if (!asset.active) return;
        if (asset.availabilityStatus == DomainEnums.AssetState.reserved
                || asset.availabilityStatus == DomainEnums.AssetState.staged
                || asset.availabilityStatus == DomainEnums.AssetState.in_custody
                || asset.availabilityStatus == DomainEnums.AssetState.in_field) {
            throw ApiException.conflict("Asset must be released from reservations and custody before write-off");
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
        catalogChanged("items", item.id);
        events.record("asset.written_off", "asset", asset.id, actor.id, transaction.idempotencyKey,
                Map.of("itemId", item.id.toString(), "assetCode", asset.assetCode));
    }

    @Transactional
    public AssetInstance relocateAsset(UUID itemId, UUID assetId, ApiModels.AssetRelocationInput input) {
        var item = locked(Item.class, itemId, "Item");
        var asset = locked(AssetInstance.class, assetId, "Asset");
        assertOwnedActiveAsset(item, asset);
        assertExpectedVersion(asset, input.expectedVersion());
        if (asset.availabilityStatus != DomainEnums.AssetState.available
                && asset.availabilityStatus != DomainEnums.AssetState.damaged
                && asset.availabilityStatus != DomainEnums.AssetState.in_repair
                && asset.availabilityStatus != DomainEnums.AssetState.in_maintenance) {
            throw ApiException.conflict("Asset cannot be relocated while it is " + asset.availabilityStatus);
        }
        var destination = required(StorageLocation.class, input.locationId(), "Storage location");
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
        return asset;
    }

    @Transactional
    public AssetInstance updateAssetCondition(UUID itemId, UUID assetId, ApiModels.AssetConditionInput input) {
        var item = locked(Item.class, itemId, "Item");
        var asset = locked(AssetInstance.class, assetId, "Asset");
        assertOwnedActiveAsset(item, asset);
        assertExpectedVersion(asset, input.expectedVersion());
        if (input.conditionStatus() == DomainEnums.ConditionStatus.lost) {
            throw ApiException.badRequest("Lost assets must be recorded through custody reconciliation");
        }
        var actor = actorService.current();
        var previous = asset.conditionStatus;
        asset.conditionStatus = input.conditionStatus();
        if (input.conditionStatus() == DomainEnums.ConditionStatus.damaged
                || input.conditionStatus() == DomainEnums.ConditionStatus.unsafe) {
            asset.availabilityStatus = DomainEnums.AssetState.damaged;
        } else if (asset.availabilityStatus == DomainEnums.AssetState.damaged) {
            asset.availabilityStatus = DomainEnums.AssetState.available;
        }
        events.record("asset.condition_changed", "asset", asset.id, actor.id, null,
                Map.of("itemId", item.id.toString(), "from", previous.name(), "to", input.conditionStatus().name()));
        return asset;
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

    private String generateSku(String name) {
        String prefix = slug(name).replace("-", "").toUpperCase(Locale.ROOT);
        if (prefix.length() > 8) prefix = prefix.substring(0, 8);
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
    }

    private void catalogChanged(String resource, UUID id) {
        events.record("catalog.changed", resource, id, actorService.current().id, null,
                Map.of("resource", resource, "id", id.toString()));
    }

    private String slug(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = orm.find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }

    private <T> T locked(Class<T> type, UUID id, String label) {
        T value = orm.findLocked(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }
}
