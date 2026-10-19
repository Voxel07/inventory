package org.ash.inventory.service;

import org.ash.inventory.helper.PageBounds;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.StockManagementOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.StockDtos;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class StockManagementService {
    private final StockManagementOrm orm;
    private final ActorService actors;
    private final DomainEventService events;

    public StockManagementService(StockManagementOrm orm, ActorService actors, DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
    }

    public List<InventoryLot> lots(UUID itemId, int page, int size) {
        actors.current();
        return orm.lots(itemId, PageBounds.of(page, size).offset(), size, actors.current());
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public InventoryLot createLot(StockDtos.LotCreateInput input) {
        var item = orm.requireLocked(Item.class, input.itemId(), "Item");
        actors.requireItemEdit(item);
        if (item.trackingMode != DomainEnums.TrackingMode.lot_tracked) {
            throw ApiException.badRequest("Inventory lots require an item with lot_tracked tracking mode");
        }
        var lot = new InventoryLot();
        lot.item = item;
        apply(lot, input.metadata(), null);
        orm.persist(lot);
        events.record("inventory_lot.created", "inventory_lot", lot.id, actors.current().id, null,
                Map.of("itemId", lot.item.id.toString(), "lotNumber", lot.lotNumber));
        return lot;
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public InventoryLot updateLot(UUID id, StockDtos.LotUpdateInput input) {
        var lot = orm.requireLocked(InventoryLot.class, id, "Inventory lot");
        actors.requireItemEdit(lot.item);
        var previousStatus = lot.status;
        apply(lot, input, id);
        events.record("inventory_lot.updated", "inventory_lot", lot.id, actors.current().id, null,
                Map.of("itemId", lot.item.id.toString(), "lotNumber", lot.lotNumber,
                        "status", lot.status.name(), "previousStatus", previousStatus.name()));
        return lot;
    }

    /** Metadata only; {@code lot.item} is fixed at creation and positions, ledger and lines reference the pair. */
    private void apply(InventoryLot lot, StockDtos.LotUpdateInput input, UUID excluding) {
        if (input.itemId() != null && !input.itemId().equals(lot.item.id))
            throw ApiException.badRequest("A lot belongs to its item; create a new lot for another item");
        if (orm.lotNumberExists(lot.item.id, input.lotNumber(), excluding)) throw ApiException.conflict("Lot number already exists for item");
        lot.lotNumber = input.lotNumber().trim();
        lot.supplierLot = input.supplierLot();
        lot.manufactureDate = input.manufactureDate();
        lot.expiryDate = input.expiryDate();
        lot.bestBeforeDate = input.bestBeforeDate();
        lot.storageRequirements = input.storageRequirements();
        lot.status = input.status() == null ? DomainEnums.LotStatus.available : input.status();
        lot.notes = input.notes();
    }

    public List<AssetInstance> assets(UUID itemId, UUID locationId, int page, int size) {
        if (locationId != null) actors.requireLocationAccess(orm.require(StorageLocation.class, locationId, "Location"), false);
        return orm.assets(itemId, locationId, PageBounds.of(page, size).offset(), size, actors.current());
    }

    public List<InventoryPosition> positions(UUID itemId, UUID locationId, int page, int size) {
        actors.current();
        if (locationId != null) actors.requireLocationAccess(orm.require(StorageLocation.class, locationId, "Location"), false);
        return orm.positions(itemId, locationId, PageBounds.of(page, size).offset(), size, actors.current());
    }



}
