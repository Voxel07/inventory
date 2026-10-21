package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.RuntimeEntry;
import org.ash.inventory.operations.internal.persistence.RuntimeOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.PageBounds;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Running hours are booked, not overwritten: every change of a meter reading leaves an entry naming the event
 * (and order) the unit ran at, so hours per event stay traceable.
 */
@ApplicationScoped
public class RuntimeService {
    @Inject RuntimeOrm orm;
    @Inject ActorService actors;
    @Inject DomainEventService events;

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public RuntimeEntry log(UUID itemId, UUID assetId, ApiModels.RuntimeInput input) {
        var item = orm.requireLocked(Item.class, itemId, "Item");
        actors.requireItemEdit(item);
        var asset = orm.requireLocked(AssetInstance.class, assetId, "Asset");
        if (!asset.item.id.equals(item.id) || !asset.active) throw ApiException.notFound("Asset not found for item");
        if (!item.tracksRuntime) throw ApiException.badRequest("This item does not record operating hours");
        if (asset.version != input.expectedVersion())
            throw ApiException.conflict("Asset version conflict; current version is " + asset.version);
        if ((input.hours() == null) == (input.reading() == null)) throw ApiException.badRequest("Provide either hours or reading");
        var current = asset.operatingHours == null ? BigDecimal.ZERO : asset.operatingHours;
        var reading = input.reading() != null ? input.reading() : current.add(input.hours());
        if (input.hours() != null && input.hours().signum() <= 0) throw ApiException.badRequest("hours must be greater than 0");
        if (reading.compareTo(current) < 0) throw ApiException.badRequest("A meter reading cannot go backwards; correct it in the asset details");
        var event = input.eventOccurrenceId() == null ? null : orm.require(EventOccurrence.class, input.eventOccurrenceId(), "Event");
        var entry = record(item, asset, reading, event, null, RuntimeEntry.Source.manual, input.notes());
        if (entry == null) throw ApiException.badRequest("The reading equals the current meter reading");
        return entry;
    }

    /**
     * Books the step from the asset's (or bulk item's) current reading to {@code reading} and moves the meter.
     * Returns null when the reading does not change.
     */
    public RuntimeEntry record(Item item, AssetInstance asset, BigDecimal reading, EventOccurrence event, InventoryOrder order,
            RuntimeEntry.Source source, String notes) {
        if (reading == null || reading.signum() < 0) return null;
        var current = asset != null ? asset.operatingHours : item.currentOperatingHours;
        if (current == null) current = BigDecimal.ZERO;
        var next = reading.setScale(2, RoundingMode.HALF_UP);
        if (next.compareTo(current) == 0) return null;
        var entry = new RuntimeEntry();
        entry.item = item;
        entry.assetInstance = asset;
        entry.eventOccurrence = event != null ? event : order == null ? null : order.eventOccurrence;
        entry.order = order;
        entry.recordedBy = actors.current();
        entry.hours = next.subtract(current);
        entry.readingAfter = next;
        entry.source = source;
        entry.recordedAt = Instant.now();
        entry.notes = notes == null || notes.isBlank() ? null : notes.trim();
        orm.persist(entry);
        if (asset != null) asset.operatingHours = next;
        else item.currentOperatingHours = next;
        events.record("runtime.recorded", asset != null ? "asset" : "item", asset != null ? asset.id : item.id, entry.recordedBy.id, null,
                Map.of("itemId", item.id.toString(), "hours", entry.hours.toPlainString(), "source", source.name()));
        return entry;
    }

    public List<RuntimeEntry> forAsset(UUID itemId, UUID assetId, int page, int size) {
        var item = orm.require(Item.class, itemId, "Item");
        actors.requireItemAccess(item);
        var asset = orm.require(AssetInstance.class, assetId, "Asset");
        if (!asset.item.id.equals(item.id)) throw ApiException.notFound("Asset not found for item");
        return orm.forAsset(asset, PageBounds.of(page, size).offset(), size);
    }

    public List<RuntimeEntry> forItem(UUID itemId, int page, int size) {
        var item = orm.require(Item.class, itemId, "Item");
        actors.requireItemAccess(item);
        return orm.forItem(item, PageBounds.of(page, size).offset(), size);
    }
}
