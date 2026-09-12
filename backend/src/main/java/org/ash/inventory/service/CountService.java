package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.CountOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.CountDtos;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class CountService {
    private final CountOrm orm;
    private final ActorService actors;
    private final DomainEventService events;

    public CountService(CountOrm orm, ActorService actors, DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
    }

    @Transactional
    public List<CountDtos.CountResponse> list(String status, int page, int size) {
        actors.requireWarehouse();
        try { return responses(orm.sessions(status, offset(page, size), size)); }
        catch (IllegalArgumentException exception) { throw ApiException.badRequest("Unknown count status"); }
    }

    @Transactional
    public CountDtos.CountResponse create(CountDtos.CountInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        if (input.warehouseId() == null && input.locationId() == null && input.itemId() == null
                && (input.category() == null || input.category().isBlank())) {
            throw ApiException.badRequest("At least one inventory count scope is required");
        }
        var warehouse = input.warehouseId() == null ? null : required(Warehouse.class, input.warehouseId(), "Warehouse");
        var location = input.locationId() == null ? null : required(StorageLocation.class, input.locationId(), "Location");
        var item = input.itemId() == null ? null : required(Item.class, input.itemId(), "Item");
        if (warehouse != null && location != null
                && (location.warehouse == null || !location.warehouse.id.equals(warehouse.id))) {
            throw ApiException.badRequest("Location does not belong to count warehouse");
        }
        var session = new InventoryCountSession();
        session.sessionNumber = uniqueNumber(input.sessionNumber());
        session.warehouse = warehouse;
        session.location = location;
        session.category = blankToNull(input.category());
        session.item = item;
        session.blindCount = input.blindCount();
        session.createdBy = actor;
        session.notes = input.notes();
        orm.persist(session);
        var lines = new ArrayList<InventoryCountLine>();
        for (var position : orm.scopedPositions(warehouse, location, item, input.category())) {
            if (position.item.trackingMode == DomainEnums.TrackingMode.serialized) continue;
            var line = new InventoryCountLine();
            line.session = session;
            line.item = position.item;
            line.location = position.location;
            line.lot = position.lot;
            line.expectedQuantity = position.quantityOnHand;
            orm.persist(line);
            lines.add(line);
        }
        for (var asset : orm.scopedAssets(warehouse, location, item, input.category())) {
            if (asset.item.trackingMode != DomainEnums.TrackingMode.serialized) continue;
            var line = new InventoryCountLine();
            line.session = session;
            line.item = asset.item;
            line.assetInstance = asset;
            line.location = asset.currentLocation;
            line.expectedQuantity = 1;
            orm.persist(line);
            lines.add(line);
        }
        if (lines.isEmpty()) throw ApiException.conflict("No inventory matches the requested count scope");
        events.record("count.created", "inventory_count", session.id, actor.id, null,
                Map.of("sessionNumber", session.sessionNumber, "lineCount", lines.size()));
        return response(session, lines);
    }

    @Transactional
    public CountDtos.CountResponse start(UUID id, CountDtos.CountCommandInput input) {
        actors.requireWarehouse();
        var session = requiredLocked(InventoryCountSession.class, id, "Inventory count");
        if (session.status == DomainEnums.CountStatus.counting) return response(session, orm.lockedLines(session));
        if (session.status != DomainEnums.CountStatus.draft) throw ApiException.conflict("Inventory count cannot be started");
        session.status = DomainEnums.CountStatus.counting;
        session.startedAt = Instant.now();
        if (input != null && input.notes() != null) session.notes = input.notes();
        return response(session, orm.lockedLines(session));
    }

    @Transactional
    public CountDtos.CountResponse submit(UUID id, CountDtos.CountSubmissionInput input, boolean recount) {
        var actor = actors.current();
        actors.requireWarehouse();
        var session = requiredLocked(InventoryCountSession.class, id, "Inventory count");
        var expectedStatus = recount ? DomainEnums.CountStatus.awaiting_recount : DomainEnums.CountStatus.counting;
        if (session.status != expectedStatus) throw ApiException.conflict("Inventory count is not ready for this submission");
        var lines = orm.lockedLines(session);
        if (input.lines().size() != lines.size()) throw ApiException.badRequest("Every count line must be submitted exactly once");
        var byId = new LinkedHashMap<UUID, InventoryCountLine>();
        lines.forEach(line -> byId.put(line.id, line));
        var seen = new HashSet<UUID>();
        boolean variance = false;
        for (var submitted : input.lines()) {
            if (!seen.add(submitted.lineId())) throw ApiException.badRequest("A count line can occur only once");
            var line = byId.get(submitted.lineId());
            if (line == null) throw ApiException.badRequest("Count line does not belong to session");
            if (line.assetInstance != null && submitted.quantity() > 1) {
                throw ApiException.badRequest("Serialized asset count must be zero or one");
            }
            if (recount) line.recountedQuantity = submitted.quantity(); else line.countedQuantity = submitted.quantity();
            line.countedBy = actor;
            line.notes = submitted.notes();
            variance |= submitted.quantity() != line.expectedQuantity;
        }
        session.completedAt = Instant.now();
        session.status = !recount && variance ? DomainEnums.CountStatus.awaiting_recount
                : DomainEnums.CountStatus.awaiting_approval;
        if (input.notes() != null) session.notes = input.notes();
        events.record(recount ? "count.recounted" : "count.counted", "inventory_count", session.id,
                actor.id, null, Map.of("sessionNumber", session.sessionNumber, "variance", variance));
        return response(session, lines);
    }

    @Transactional
    public CountDtos.CountResponse approve(UUID id, CountDtos.CountCommandInput input) {
        var actor = actors.current();
        actors.requireAdmin();
        var session = requiredLocked(InventoryCountSession.class, id, "Inventory count");
        if (session.status != DomainEnums.CountStatus.awaiting_approval) {
            throw ApiException.conflict("Inventory count is not awaiting approval");
        }
        var lines = orm.lockedLines(session);
        for (var line : lines) {
            line.approvedQuantity = line.recountedQuantity == null ? line.countedQuantity : line.recountedQuantity;
            if (line.approvedQuantity == null) throw ApiException.conflict("Count line has no submitted quantity");
            line.varianceQuantity = line.approvedQuantity - line.expectedQuantity;
        }
        session.status = DomainEnums.CountStatus.approved;
        session.approvedBy = actor;
        session.approvedAt = Instant.now();
        if (input != null && input.notes() != null) session.notes = input.notes();
        events.record("count.approved", "inventory_count", session.id, actor.id, null,
                Map.of("sessionNumber", session.sessionNumber));
        return response(session, lines);
    }

    @Transactional
    public CountDtos.CountResponse post(UUID id, CountDtos.CountCommandInput input) {
        var actor = actors.current();
        actors.requireWarehouse();
        var session = requiredLocked(InventoryCountSession.class, id, "Inventory count");
        if (session.status == DomainEnums.CountStatus.posted) return response(session, orm.lockedLines(session));
        if (session.status != DomainEnums.CountStatus.approved) throw ApiException.conflict("Inventory count is not approved");
        var lines = orm.lockedLines(session);
        for (var line : lines) {
            if (line.assetInstance != null) {
                var asset = requiredLocked(AssetInstance.class, line.assetInstance.id, "Asset");
                if (line.approvedQuantity == 0) {
                    asset.availabilityStatus = DomainEnums.AssetState.lost;
                    asset.conditionStatus = DomainEnums.ConditionStatus.lost;
                }
            } else {
                var position = orm.lockedPosition(line.item, line.location, line.lot);
                if (position == null || position.quantityOnHand != line.expectedQuantity) {
                    throw ApiException.conflict("Inventory changed after the count snapshot for " + line.item.name);
                }
                position.quantityOnHand = line.approvedQuantity;
                position.lastCountedAt = Instant.now();
            }
            if (line.varianceQuantity != null && line.varianceQuantity != 0) appendAdjustment(session, line, actor);
        }
        session.status = DomainEnums.CountStatus.posted;
        if (input != null && input.notes() != null) session.notes = input.notes();
        events.record("count.posted", "inventory_count", session.id, actor.id, null,
                Map.of("sessionNumber", session.sessionNumber));
        return response(session, lines);
    }

    @Transactional
    public CountDtos.CountResponse cancel(UUID id, CountDtos.CountCommandInput input) {
        actors.requireWarehouse();
        var session = requiredLocked(InventoryCountSession.class, id, "Inventory count");
        if (session.status == DomainEnums.CountStatus.cancelled) return response(session, orm.lockedLines(session));
        if (session.status == DomainEnums.CountStatus.posted) throw ApiException.conflict("Posted counts cannot be cancelled");
        session.status = DomainEnums.CountStatus.cancelled;
        if (input != null && input.notes() != null) session.notes = input.notes();
        events.record("count.cancelled", "inventory_count", session.id, actors.current().id, null,
                Map.of("sessionNumber", session.sessionNumber));
        return response(session, orm.lockedLines(session));
    }

    private void appendAdjustment(InventoryCountSession session, InventoryCountLine line, UserAccount actor) {
        var transaction = new StockTransaction();
        transaction.item = line.item;
        transaction.assetInstance = line.assetInstance;
        transaction.user = actor;
        transaction.type = DomainEnums.TransactionType.adjusted;
        transaction.quantity = line.varianceQuantity;
        transaction.sourceLocation = line.varianceQuantity < 0 ? line.location : null;
        transaction.destinationLocation = line.varianceQuantity > 0 ? line.location : null;
        transaction.relatedEntityType = "inventory_count";
        transaction.relatedEntityId = session.id;
        transaction.reason = "Inventory count " + session.sessionNumber;
        orm.persist(transaction);
    }

    private List<CountDtos.CountResponse> responses(List<InventoryCountSession> sessions) {
        var bySession = new LinkedHashMap<UUID, List<InventoryCountLine>>();
        orm.lines(sessions).forEach(line -> bySession.computeIfAbsent(line.session.id, ignored -> new ArrayList<>()).add(line));
        return sessions.stream().map(session -> response(session,
                bySession.getOrDefault(session.id, List.of()))).toList();
    }

    private CountDtos.CountResponse response(InventoryCountSession value, List<InventoryCountLine> lines) {
        boolean hideExpected = value.blindCount
                && (value.status == DomainEnums.CountStatus.draft || value.status == DomainEnums.CountStatus.counting);
        return new CountDtos.CountResponse(value.id, value.sessionNumber,
                value.warehouse == null ? null : value.warehouse.id,
                value.location == null ? null : value.location.id, value.category,
                value.item == null ? null : value.item.id, value.blindCount, value.status.name(),
                value.createdBy.id, value.approvedBy == null ? null : value.approvedBy.id,
                value.startedAt, value.completedAt, value.approvedAt, value.notes,
                lines.stream().map(line -> new CountDtos.CountLineResponse(line.id, line.item.id,
                        line.item.name, line.assetInstance == null ? null : line.assetInstance.id,
                        line.assetInstance == null ? null : line.assetInstance.assetCode,
                        line.lot == null ? null : line.lot.id, line.location.id,
                        hideExpected ? null : line.expectedQuantity, line.countedQuantity,
                        line.recountedQuantity, line.approvedQuantity, line.varianceQuantity,
                        line.countedBy == null ? null : line.countedBy.id, line.notes)).toList());
    }

    private String uniqueNumber(String requested) {
        var value = requested == null || requested.isBlank()
                ? "COUNT-" + LocalDate.now().getYear() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT)
                : requested.trim();
        if (orm.numberExists(value)) throw ApiException.conflict("Count session number already exists");
        return value;
    }
    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private int offset(int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        try { return Math.multiplyExact(page, size); }
        catch (ArithmeticException exception) { throw ApiException.badRequest("Page offset is too large"); }
    }
    private <T> T required(Class<T> type, UUID id, String label) {
        var value = orm.find(type, id); if (value == null) throw ApiException.notFound(label + " not found"); return value;
    }
    private <T> T requiredLocked(Class<T> type, UUID id, String label) {
        var value = orm.locked(type, id); if (value == null) throw ApiException.notFound(label + " not found"); return value;
    }
}
