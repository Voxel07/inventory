package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.helper.storage.MediaService;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.ReturnSubmission;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.ReturnSubmissionOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class ReturnSubmissionService {
    private final ReturnSubmissionOrm orm;
    private final ActorService actors;
    private final InventoryOperationsService inventory;
    private final OrderService orders;
    private final MediaService media;
    private final DomainEventService events;

    public ReturnSubmissionService(ReturnSubmissionOrm orm, ActorService actors,
            InventoryOperationsService inventory, OrderService orders, MediaService media,
            DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.inventory = inventory;
        this.orders = orders;
        this.media = media;
        this.events = events;
    }

    @Transactional
    public ReturnSubmission create(ApiModels.ReturnSubmissionInput input) {
        var actor = actors.current();
        var item = requiredLocked(Item.class, input.itemId(), "Item");
        var returnedFor = input.returnedForUserId() == null ? actor
                : required(UserAccount.class, input.returnedForUserId(), "Return user");
        if (!actor.id.equals(returnedFor.id) && !canManageReturns(actor)) {
            throw ApiException.forbidden("Only warehouse workers can register a return for another person");
        }

        long outstanding = orm.checkedOutQuantity(item, returnedFor);
        long alreadyPending = orm.pendingQuantity(item, returnedFor);
        if (input.quantity() + alreadyPending > outstanding) {
            throw ApiException.conflict("Return quantity exceeds the user's outstanding quantity");
        }

        AssetInstance asset = null;
        DomainEnums.AssetState valueAssetStateHolder = null;
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            if (input.quantity() != 1 || input.assetInstanceId() == null) {
                throw ApiException.badRequest("Serialized returns require exactly one asset instance");
            }
            asset = requiredLocked(AssetInstance.class, input.assetInstanceId(), "Asset instance");
            if (!asset.item.id.equals(item.id)) throw ApiException.badRequest("Asset does not belong to this item");
            if (asset.availabilityStatus != DomainEnums.AssetState.in_field
                    && asset.availabilityStatus != DomainEnums.AssetState.in_custody) {
                throw ApiException.conflict("Asset is not currently checked out");
            }
            valueAssetStateHolder = asset.availabilityStatus;
            asset.availabilityStatus = DomainEnums.AssetState.returned_pending_check;
        } else if (input.assetInstanceId() != null) {
            throw ApiException.badRequest("Asset instance is only valid for serialized items");
        }

        var value = new ReturnSubmission();
        value.item = item;
        value.assetInstance = asset;
        value.previousAssetState = valueAssetStateHolder;
        value.factionOrder = input.factionOrderId() == null ? null
                : required(FactionOrder.class, input.factionOrderId(), "Faction order");
        value.returnedFor = returnedFor;
        value.submittedBy = actor;
        value.expectedReturnLocation = item.returnLocation == null ? item.storageLocation : item.returnLocation;
        value.quantity = input.quantity();
        value.notes = blankToNull(input.notes());
        value.status = DomainEnums.ReturnSubmissionStatus.pending;
        orm.persist(value);
        if (input.placementImage() != null && !input.placementImage().isBlank()) {
            value.placementImageObjectKey = media.attachToReturnSubmission(input.placementImage(), value.id);
        }
        events.record("return.submitted", "return_submission", value.id, actor.id, null,
                Map.of("itemId", item.id.toString(), "quantity", value.quantity));
        return value;
    }

    @Transactional
    public ReturnSubmission acknowledge(UUID id, ApiModels.ReturnDecisionInput input) {
        actors.requireWarehouse();
        var value = pending(id);
        var worker = actors.current();
        if (value.factionOrder != null) {
            var line = new ApiModels.ReturnLine(value.quantity, 0, 0, 0, null, value.notes);
            Map<UUID, ApiModels.AssetReturnLine> assets = value.assetInstance == null ? Map.of()
                    : Map.of(value.assetInstance.id, new ApiModels.AssetReturnLine(
                            DomainEnums.ReconciliationOutcome.returned_good, null, value.notes));
            orders.returnItems(value.factionOrder.id,
                    new ApiModels.ReturnInput(Map.of(value.item.id, line), assets, value.id, value.notes));
        } else {
            inventory.transact(new ApiModels.TransactionInput(
                    value.item.id, DomainEnums.TransactionType.checkin, value.quantity,
                    "Return accepted by warehouse", value.notes, null, null,
                    value.assetInstance == null ? null : value.assetInstance.id,
                    value.returnedFor.id, null, value.id));
        }
        value.status = DomainEnums.ReturnSubmissionStatus.accepted;
        value.acknowledgedBy = worker;
        value.acknowledgedAt = Instant.now();
        value.acknowledgementNotes = input == null ? null : blankToNull(input.notes());
        events.record("return.accepted", "return_submission", value.id, worker.id, value.id,
                Map.of("itemId", value.item.id.toString(), "quantity", value.quantity));
        return value;
    }

    @Transactional
    public ReturnSubmission reject(UUID id, ApiModels.ReturnDecisionInput input) {
        actors.requireWarehouse();
        var value = pending(id);
        var worker = actors.current();
        if (value.assetInstance != null) value.assetInstance.availabilityStatus = value.previousAssetState == null
                ? DomainEnums.AssetState.in_field : value.previousAssetState;
        value.status = DomainEnums.ReturnSubmissionStatus.rejected;
        value.acknowledgedBy = worker;
        value.acknowledgedAt = Instant.now();
        value.acknowledgementNotes = input == null ? null : blankToNull(input.notes());
        events.record("return.rejected", "return_submission", value.id, worker.id, value.id,
                Map.of("itemId", value.item.id.toString(), "quantity", value.quantity));
        return value;
    }

    @Transactional
    public List<ReturnSubmission> list(DomainEnums.ReturnSubmissionStatus status) {
        var actor = actors.current();
        return orm.list(status, actor, canManageReturns(actor));
    }

    private ReturnSubmission pending(UUID id) {
        var value = orm.findLocked(id);
        if (value == null) throw ApiException.notFound("Return submission not found");
        if (value.status != DomainEnums.ReturnSubmissionStatus.pending) {
            throw ApiException.conflict("Return submission has already been processed");
        }
        return value;
    }

    private boolean canManageReturns(UserAccount actor) {
        return actor.role == DomainEnums.UserRole.hq_admin || actor.role == DomainEnums.UserRole.warehouse_crew;
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = orm.find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }

    private <T> T requiredLocked(Class<T> type, UUID id, String label) {
        T value = orm.findLocked(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
