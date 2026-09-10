package org.ash.inventory.service;

import io.quarkus.cache.CacheInvalidateAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class CatalogService {
    @Inject org.ash.inventory.helper.storage.MediaService media;
    @Inject ActorService actorService;
    @Inject CatalogOrm orm;
    @Inject DomainEventService events;

    public List<Item> getItems(String search) {
        return orm.items(search);
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
        if (input.trackingMode() != null && input.trackingMode() != item.trackingMode) {
            long assetCount = orm.countAssets(item);
            long txCount = orm.countTransactions(item);
            if (item.baseAmount > 0 || assetCount > 0 || txCount > 0) {
                throw ApiException.badRequest("Cannot change tracking mode for an item with existing stock or transaction history");
            }
        }
        apply(item, input);
        if (input.images() != null) {
            orm.deleteItemImages(item);
            persistImages(item, input.images());
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
        item.eventTags = input.eventTypes() == null ? new ArrayList<>() : new ArrayList<>(input.eventTypes());
        item.consumable = input.consumable();
        item.trackingMode = input.trackingMode() == null ? DomainEnums.TrackingMode.bulk : input.trackingMode();
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
        item.positionDetails = input.positionDetails();
        item.hint = input.hint();
        item.containerSize = input.containerSize();
        item.containerCount = input.containerCount();
        item.containersOpened = input.containersOpened();
        item.containerRemainingPercent = input.containerRemainingPercent();
        item.maintenanceIntervalDays = input.maintenanceIntervalDays();
        item.nextMaintenanceDue = input.nextMaintenanceDue();
        if (input.currentOperatingHours() != null) item.currentOperatingHours = input.currentOperatingHours();
        if (input.maintenanceStatus() != null) item.maintenanceStatus = input.maintenanceStatus();
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
        if (orm.countItemsAt(location) > 0) throw ApiException.conflict("Storage location is still assigned to inventory items");
        orm.remove(location);
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
        if (input.image() != null && !input.image().isBlank()) {
            target.imageObjectKey = media.attachToAssembly(input.image(), target.id);
        } else if (input.removeImage()) {
            target.imageObjectKey = null;
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
        return createEvent(new ApiModels.EventInput(eventType, eventType.toUpperCase(Locale.ROOT) + " " + date.getYear(), date, date, "planned", null));
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
        var item = required(Item.class, itemId, "Item");
        return orm.assetInstances(item);
    }

    @Transactional
    public List<AssetInstance> createAssets(UUID itemId, ApiModels.AssetInstanceInput input) {
        var item = locked(Item.class, itemId, "Item");
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
        if (input.assetCode() != null && !input.assetCode().isBlank() && !input.assetCode().equalsIgnoreCase(asset.assetCode)) {
            if (orm.assetCodeExists(input.assetCode())) throw ApiException.conflict("Asset code already exists");
            asset.assetCode = input.assetCode().trim().toUpperCase(Locale.ROOT);
        }
        if (input.serialNumber() != null) asset.serialNumber = input.serialNumber().trim();
        if (input.conditionStatus() != null) asset.conditionStatus = input.conditionStatus();
        if (input.availabilityStatus() != null) asset.availabilityStatus = input.availabilityStatus();
        if (input.currentLocationId() != null) {
            asset.currentLocation = required(StorageLocation.class, input.currentLocationId(), "Storage location");
        }
        if (input.currentCustodianId() != null) {
            asset.currentCustodian = required(UserAccount.class, input.currentCustodianId(), "User");
        }
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
        asset.active = false;
        catalogChanged("items", item.id);
        events.record("asset.retired", "asset", asset.id, actorService.current().id, null,
                Map.of("itemId", item.id.toString(), "assetCode", asset.assetCode));
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
