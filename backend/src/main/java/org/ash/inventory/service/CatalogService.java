package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import org.ash.inventory.api.ApiException;
import org.ash.inventory.api.ApiModels;
import org.ash.inventory.domain.Assembly;
import org.ash.inventory.domain.AssemblyItem;
import org.ash.inventory.domain.AssemblyItemId;
import org.ash.inventory.domain.EventOccurrence;
import org.ash.inventory.domain.Faction;
import org.ash.inventory.domain.Item;
import org.ash.inventory.domain.ItemImage;
import org.ash.inventory.domain.StorageLocation;

import jakarta.inject.Inject;
import org.ash.inventory.domain.DomainEnums;
import org.ash.inventory.domain.StockTransaction;
import org.ash.inventory.security.ActorService;

import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@ApplicationScoped
public class CatalogService {
    @Inject ActorService actorService;

    @Transactional
    public Item createItem(ApiModels.ItemInput input) {
        var item = new Item();
        apply(item, input);
        item.persist();
        persistImages(item, input.images());
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
            tx.persist();
        }
        return item;
    }

    @Transactional
    public Item updateItem(UUID id, ApiModels.ItemInput input) {
        var item = locked(Item.class, id, "Item");
        apply(item, input);
        if (input.images() != null) {
            ItemImage.delete("item", item);
            persistImages(item, input.images());
        }
        return item;
    }

    @Transactional
    public void retireItem(UUID id) {
        var item = locked(Item.class, id, "Item");
        item.active = false;
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
    public StorageLocation createLocation(ApiModels.StorageLocationInput input) {
        var location = new StorageLocation();
        apply(location, input);
        location.persist();
        return location;
    }

    @Transactional
    public StorageLocation updateLocation(UUID id, ApiModels.StorageLocationInput input) {
        var location = locked(StorageLocation.class, id, "Storage location");
        apply(location, input);
        return location;
    }

    @Transactional
    public void deleteLocation(UUID id) {
        var location = locked(StorageLocation.class, id, "Storage location");
        if (Item.count("storageLocation", location) > 0) throw ApiException.conflict("Storage location is still assigned to inventory items");
        location.delete();
    }

    private void apply(StorageLocation target, ApiModels.StorageLocationInput input) {
        target.name = input.name().trim();
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
    public Assembly createAssembly(ApiModels.AssemblyInput input) {
        var assembly = new Assembly();
        apply(assembly, input);
        assembly.persist();
        replaceComponents(assembly, input);
        return assembly;
    }

    @Transactional
    public Assembly updateAssembly(UUID id, ApiModels.AssemblyInput input) {
        var assembly = locked(Assembly.class, id, "Assembly");
        apply(assembly, input);
        AssemblyItem.delete("assembly", assembly);
        replaceComponents(assembly, input);
        return assembly;
    }

    @Transactional
    public void deleteAssembly(UUID id) {
        var assembly = locked(Assembly.class, id, "Assembly");
        AssemblyItem.delete("assembly", assembly);
        assembly.delete();
    }

    private void apply(Assembly target, ApiModels.AssemblyInput input) {
        target.name = input.name().trim();
        target.description = input.description();
        target.hint = input.hint();
        target.eventTags = input.eventTypes() == null ? new ArrayList<>() : new ArrayList<>(input.eventTypes());
    }

    private void replaceComponents(Assembly assembly, ApiModels.AssemblyInput input) {
        for (var entry : input.itemQuantities().entrySet()) {
            if (entry.getValue() == null || entry.getValue() < 1) throw ApiException.badRequest("Assembly component quantities must be positive");
            var component = new AssemblyItem();
            component.assembly = assembly;
            component.item = required(Item.class, entry.getKey(), "Item");
            component.id = new AssemblyItemId(assembly.id, component.item.id);
            component.quantity = entry.getValue();
            component.persist();
        }
    }

    @Transactional
    public EventOccurrence createEvent(ApiModels.EventInput input) {
        var event = new EventOccurrence();
        event.eventType = input.eventType().toUpperCase(Locale.ROOT);
        event.name = input.name() == null || input.name().isBlank() ? event.eventType + " " + input.startDate().getYear() : input.name();
        event.startDate = input.startDate();
        event.endDate = input.endDate() == null ? input.startDate() : input.endDate();
        if (event.endDate.isBefore(event.startDate)) throw ApiException.badRequest("Event end date cannot be before its start date");
        event.status = input.status() == null ? "planned" : input.status();
        event.notes = input.notes();
        event.persist();
        return event;
    }

    @Transactional
    public EventOccurrence updateEvent(UUID id, ApiModels.EventInput input) {
        var event = locked(EventOccurrence.class, id, "Event occurrence");
        event.eventType = input.eventType().toUpperCase(Locale.ROOT);
        event.name = input.name() == null ? event.name : input.name();
        event.startDate = input.startDate();
        event.endDate = input.endDate() == null ? input.startDate() : input.endDate();
        event.status = input.status() == null ? event.status : input.status();
        event.notes = input.notes();
        return event;
    }

    @Transactional
    public Faction createFaction(ApiModels.FactionInput input) {
        var faction = new Faction();
        faction.eventType = input.eventType().toUpperCase(Locale.ROOT);
        faction.name = input.name().trim();
        faction.slug = input.slug() == null || input.slug().isBlank() ? slug(input.name()) : slug(input.slug());
        faction.active = input.active() == null || input.active();
        faction.persist();
        return faction;
    }

    public EventOccurrence findOrCreateEvent(String eventType, LocalDate date) {
        var event = EventOccurrence.<EventOccurrence>find("eventType = ?1 and startDate = ?2", eventType.toUpperCase(Locale.ROOT), date).firstResult();
        if (event != null) return event;
        return createEvent(new ApiModels.EventInput(eventType, eventType.toUpperCase(Locale.ROOT) + " " + date.getYear(), date, date, "planned", null));
    }

    public Faction findOrCreateFaction(String eventType, String name) {
        var faction = Faction.<Faction>find("eventType = ?1 and lower(name) = ?2", eventType.toUpperCase(Locale.ROOT), name.toLowerCase(Locale.ROOT)).firstResult();
        if (faction != null) return faction;
        return createFaction(new ApiModels.FactionInput(eventType, name, slug(name), true));
    }

    private void persistImages(Item item, List<String> images) {
        if (images == null) return;
        int order = 0;
        for (String objectKey : images) {
            if (objectKey == null || objectKey.isBlank()) continue;
            var image = new ItemImage();
            image.item = item;
            image.objectKey = objectKey;
            image.displayOrder = order++;
            image.persist();
        }
    }

    private String generateSku(String name) {
        String prefix = slug(name).replace("-", "").toUpperCase(Locale.ROOT);
        if (prefix.length() > 8) prefix = prefix.substring(0, 8);
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
    }

    private String slug(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = io.quarkus.hibernate.orm.panache.Panache.getEntityManager().find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }

    private <T> T locked(Class<T> type, UUID id, String label) {
        T value = io.quarkus.hibernate.orm.panache.Panache.getEntityManager().find(type, id, LockModeType.PESSIMISTIC_WRITE);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }
}
