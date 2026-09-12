package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.StockManagementOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.StockDtos;

import java.time.Instant;
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

    public List<Warehouse> warehouses(int page, int size) {
        actors.current();
        return orm.warehouses(offset(page, size), size);
    }

    @Transactional
    public Warehouse createWarehouse(StockDtos.WarehouseInput input) {
        actors.requireWarehouse();
        if (orm.warehouseCodeExists(input.code(), null)) throw ApiException.conflict("Warehouse code already exists");
        var warehouse = new Warehouse();
        apply(warehouse, input);
        orm.persist(warehouse);
        events.record("warehouse.created", "warehouse", warehouse.id, actors.current().id, null, Map.of("code", warehouse.code));
        return warehouse;
    }

    @Transactional
    public Warehouse updateWarehouse(UUID id, StockDtos.WarehouseInput input) {
        actors.requireWarehouse();
        var warehouse = requiredLocked(Warehouse.class, id, "Warehouse");
        if (orm.warehouseCodeExists(input.code(), id)) throw ApiException.conflict("Warehouse code already exists");
        apply(warehouse, input);
        events.record("warehouse.updated", "warehouse", id, actors.current().id, null, Map.of("code", warehouse.code));
        return warehouse;
    }

    @Transactional
    public void retireWarehouse(UUID id) {
        actors.requireWarehouse();
        var warehouse = requiredLocked(Warehouse.class, id, "Warehouse");
        warehouse.active = false;
        events.record("warehouse.retired", "warehouse", id, actors.current().id, null, Map.of("code", warehouse.code));
    }

    private void apply(Warehouse value, StockDtos.WarehouseInput input) {
        value.code = input.code().trim().toUpperCase(Locale.ROOT);
        value.name = input.name().trim();
        value.description = input.description();
        if (input.active() != null) value.active = input.active();
    }

    public List<InventoryCode> codes(UUID targetId, int page, int size) {
        actors.current();
        return orm.codes(targetId, offset(page, size), size);
    }

    public InventoryCode resolveCode(String code) {
        actors.current();
        var result = orm.activeCode(code);
        if (result == null) throw ApiException.notFound("Inventory code not found");
        return result;
    }

    @Transactional
    public InventoryCode createCode(StockDtos.InventoryCodeInput input) {
        actors.requireWarehouse();
        validateCodeTarget(input.targetType(), input.targetId());
        if (orm.codeExists(input.code(), null)) throw ApiException.conflict("Inventory code already exists");
        var code = new InventoryCode();
        apply(code, input);
        if (code.primaryCode) orm.clearPrimaryCode(code.targetType, code.targetId, null);
        orm.persist(code);
        events.record("inventory_code.created", "inventory_code", code.id, actors.current().id, null,
                Map.of("targetType", code.targetType.name(), "targetId", code.targetId.toString()));
        return code;
    }

    @Transactional
    public InventoryCode updateCode(UUID id, StockDtos.InventoryCodeInput input) {
        actors.requireWarehouse();
        var code = requiredLocked(InventoryCode.class, id, "Inventory code");
        validateCodeTarget(input.targetType(), input.targetId());
        if (orm.codeExists(input.code(), id)) throw ApiException.conflict("Inventory code already exists");
        apply(code, input);
        if (code.primaryCode) orm.clearPrimaryCode(code.targetType, code.targetId, id);
        return code;
    }

    @Transactional
    public void retireCode(UUID id) {
        actors.requireWarehouse();
        var code = requiredLocked(InventoryCode.class, id, "Inventory code");
        code.active = false;
        code.primaryCode = false;
        code.retiredAt = Instant.now();
    }

    private void apply(InventoryCode value, StockDtos.InventoryCodeInput input) {
        value.code = input.code().trim().toUpperCase(Locale.ROOT);
        value.targetType = input.targetType();
        value.targetId = input.targetId();
        value.primaryCode = input.primaryCode();
        value.active = true;
        value.retiredAt = null;
    }

    private void validateCodeTarget(DomainEnums.CodeTargetType type, UUID id) {
        Class<?> entityType = switch (type) {
            case product -> Item.class;
            case asset -> AssetInstance.class;
            case location -> StorageLocation.class;
            case assembly -> Assembly.class;
            case lot -> InventoryLot.class;
            case container -> throw ApiException.badRequest("Container codes are not supported until containers are modeled");
        };
        if (orm.find(entityType, id) == null) throw ApiException.badRequest("Inventory code target does not exist");
    }

    public List<InventoryLot> lots(UUID itemId, int page, int size) {
        actors.current();
        return orm.lots(itemId, offset(page, size), size);
    }

    @Transactional
    public InventoryLot createLot(StockDtos.LotInput input) {
        actors.requireWarehouse();
        var lot = new InventoryLot();
        apply(lot, input, null);
        orm.persist(lot);
        events.record("inventory_lot.created", "inventory_lot", lot.id, actors.current().id, null,
                Map.of("itemId", lot.item.id.toString(), "lotNumber", lot.lotNumber));
        return lot;
    }

    @Transactional
    public InventoryLot updateLot(UUID id, StockDtos.LotInput input) {
        actors.requireWarehouse();
        var lot = requiredLocked(InventoryLot.class, id, "Inventory lot");
        apply(lot, input, id);
        return lot;
    }

    private void apply(InventoryLot lot, StockDtos.LotInput input, UUID excluding) {
        var item = required(Item.class, input.itemId(), "Item");
        if (item.trackingMode != DomainEnums.TrackingMode.lot_tracked) {
            throw ApiException.badRequest("Inventory lots require an item with lot_tracked tracking mode");
        }
        if (orm.lotNumberExists(item.id, input.lotNumber(), excluding)) throw ApiException.conflict("Lot number already exists for item");
        lot.item = item;
        lot.lotNumber = input.lotNumber().trim();
        lot.supplierLot = input.supplierLot();
        lot.manufactureDate = input.manufactureDate();
        lot.expiryDate = input.expiryDate();
        lot.bestBeforeDate = input.bestBeforeDate();
        lot.storageRequirements = input.storageRequirements();
        lot.status = input.status() == null ? DomainEnums.LotStatus.available : input.status();
        lot.notes = input.notes();
    }

    public List<InventoryPosition> positions(UUID itemId, UUID locationId, int page, int size) {
        actors.current();
        return orm.positions(itemId, locationId, offset(page, size), size);
    }

    private int offset(int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        try { return Math.multiplyExact(page, size); }
        catch (ArithmeticException exception) { throw ApiException.badRequest("page is too large"); }
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        var value = orm.find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }

    private <T> T requiredLocked(Class<T> type, UUID id, String label) {
        var value = orm.findLocked(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }
}
