package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.contract.dto.StockDtos;
import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.StockManagementOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.PageBounds;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
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

    /**
     * The only way a lot comes into being: the stock booking that brings its first units in. The caller holds the
     * item lock and has authorized the booking; the lot belongs to that item for life.
     */
    @Transactional(Transactional.TxType.MANDATORY)
    public InventoryLot newLot(Item item, StockDtos.LotInput input) {
        if (item.trackingMode != DomainEnums.TrackingMode.lot_tracked)
            throw ApiException.badRequest("Inventory lots require an item with lot_tracked tracking mode");
        var lot = new InventoryLot();
        lot.item = item;
        apply(lot, input, null);
        orm.persist(lot);
        events.record("inventory_lot.created", "inventory_lot", lot.id, actors.current().id, null,
                Map.of("itemId", lot.item.id.toString(), "lotNumber", lot.lotNumber));
        return lot;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public InventoryLot updateLot(UUID id, StockDtos.LotInput input) {
        var lot = orm.requireLocked(InventoryLot.class, id, "Inventory lot");
        actors.requireItemEdit(lot.item);
        var previousStatus = lot.status;
        apply(lot, input, id);
        events.record("inventory_lot.updated", "inventory_lot", lot.id, actors.current().id, null,
                Map.of("itemId", lot.item.id.toString(), "lotNumber", lot.lotNumber,
                        "status", lot.status.name(), "previousStatus", previousStatus.name()));
        return lot;
    }

    /** Number, expiry and eligibility only; {@code lot.item} is fixed at creation. */
    private void apply(InventoryLot lot, StockDtos.LotInput input, UUID excluding) {
        var number = input.lotNumber() == null ? "" : input.lotNumber().trim();
        if (number.isEmpty()) throw ApiException.badRequest("Lot number is required");
        if (orm.lotNumberExists(lot.item.id, number, excluding)) throw ApiException.conflict("Lot number already exists for item");
        lot.lotNumber = number;
        lot.expiryDate = input.expiryDate();
        lot.status = input.status() == null ? DomainEnums.LotStatus.available : input.status();
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
