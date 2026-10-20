package org.ash.inventory.service;

import org.ash.inventory.helper.Inputs;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.helper.storage.MediaService;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.InventoryOrder;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MemberRequest;
import org.ash.inventory.model.ReturnSubmission;
import org.ash.inventory.model.RuntimeEntry;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.ReturnSubmissionOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiModels;
import org.ash.inventory.resource.dto.ApiResponses;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class ReturnSubmissionService {
    @jakarta.inject.Inject CustodyBalanceService custody;
    @jakarta.inject.Inject RuntimeService runtime;
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
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public ReturnSubmission create(ApiModels.ReturnSubmissionInput input) {
        var actor = actors.current();
        actors.requireOrdering();
        var item = orm.requireLockedFresh(Item.class, input.itemId(), "Item");
        var returnedFor = input.returnedForUserId() == null ? actor
                : orm.require(UserAccount.class, input.returnedForUserId(), "Return user");
        if (!actor.id.equals(returnedFor.id) && !canManageReturns(actor)) {
            throw ApiException.forbidden("Only warehouse workers can register a return for another person");
        }

        var balance = custody.list(false).stream().filter(row -> row.itemId().equals(item.id)
                && row.personId().equals(returnedFor.id)
                && java.util.Objects.equals(row.orderId(), input.orderId())
                && (row.factionOrder() || java.util.Objects.equals(row.assetInstanceId(), input.assetInstanceId()))
                && (input.orderId() != null || java.util.Objects.equals(row.eventOccurrenceId(), input.eventOccurrenceId())))
                .findFirst().orElseThrow(() -> ApiException.conflict("No matching outstanding custody; return order items through their order"));
        if (input.quantity() + balance.pendingQuantity() > balance.checkedOut()) {
            throw ApiException.conflict("Return quantity exceeds the user's outstanding quantity");
        }

        AssetInstance asset = null;
        DomainEnums.AssetState valueAssetStateHolder = null;
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            if (input.quantity() != 1 || input.assetInstanceId() == null) {
                throw ApiException.badRequest("Serialized returns require exactly one asset instance");
            }
            asset = orm.requireLockedFresh(AssetInstance.class, input.assetInstanceId(), "Asset instance");
            if (!asset.item.id.equals(item.id)) throw ApiException.badRequest("Asset does not belong to this item");
            if (input.orderId() != null && !orm.assignedToOrder(asset.id, input.orderId())) {
                throw ApiException.conflict("Asset is not assigned to this order");
            }
            if (asset.availabilityStatus != DomainEnums.AssetState.in_field
                    && asset.availabilityStatus != DomainEnums.AssetState.in_custody) {
                throw ApiException.conflict("Asset is not currently checked out");
            }
            valueAssetStateHolder = asset.availabilityStatus;
            asset.availabilityStatus = DomainEnums.AssetState.returned_pending_check;
            orm.flush();
        } else if (input.assetInstanceId() != null) {
            throw ApiException.badRequest("Asset instance is only valid for serialized items");
        }

        var value = new ReturnSubmission();
        value.item = item;
        value.assetInstance = asset;
        value.previousAssetState = valueAssetStateHolder;
        value.pendingAssetVersion = asset == null ? null : asset.version;
        value.order = input.orderId() == null ? null
                : orm.require(InventoryOrder.class, input.orderId(), "Order");
        value.eventOccurrence = balance.eventOccurrenceId() == null ? null
                : orm.require(org.ash.inventory.model.EventOccurrence.class, balance.eventOccurrenceId(), "Event");
        value.returnedFor = returnedFor;
        value.submittedBy = actor;
        value.expectedReturnLocation = item.returnLocation == null ? item.storageLocation : item.returnLocation;
        value.quantity = input.quantity();
        value.notes = Inputs.blankToNull(input.notes());
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
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public ReturnSubmission acknowledge(UUID id, ApiModels.ReturnDecisionInput input) {
        actors.requireWarehouse();
        var value = pendingForDecision(id);
        var worker = actors.current();
        var before = currentReading(value);
        var reading = runtimeReading(value, input);
        if (value.order != null) {
            var relevant = value.order.lines.stream().filter(line -> line.item.id.equals(value.item.id)).toList();
            int outstanding = relevant.stream().mapToInt(CustodyQuantities::outstanding).sum();
            int missing = relevant.stream().mapToInt(line -> line.missingQuantity).sum();
            // The order books the reading against its event (OrderService.returnItems).
            var line = new ApiModels.ReturnLine(value.quantity, Math.min(missing, Math.max(0, outstanding - value.quantity)), 0, 0,
                    value.assetInstance == null ? reading : null, value.notes);
            Map<UUID, ApiModels.AssetReturnLine> assets = value.assetInstance == null ? Map.of()
                    : Map.of(value.assetInstance.id, new ApiModels.AssetReturnLine(
                            DomainEnums.ReconciliationOutcome.returned_good, reading, value.notes));
            orders.returnItems(value.order.id,
                    new ApiModels.ReturnInput(Map.of(value.item.id, line), assets, value.id, value.notes));
        } else {
            inventory.transact(new ApiModels.TransactionInput(
                    value.item.id, DomainEnums.TransactionType.checkin, value.quantity,
                    "Return accepted by warehouse", value.notes, null, null,
                    value.assetInstance == null ? null : value.assetInstance.id,
                    value.returnedFor.id, value.id,
                    value.eventOccurrence == null ? null : value.eventOccurrence.id, null, null, null));
            if (reading != null) {
                var asset = value.assetInstance == null ? null : orm.requireLocked(AssetInstance.class, value.assetInstance.id, "Asset instance");
                runtime.record(value.item, asset, reading, value.eventOccurrence, null, RuntimeEntry.Source.return_check, input == null ? null : input.notes());
            }
        }
        if (reading != null) value.runtimeHours = reading.subtract(before);
        value.status = DomainEnums.ReturnSubmissionStatus.accepted;
        value.acknowledgedBy = worker;
        value.acknowledgedAt = Instant.now();
        value.acknowledgementNotes = input == null ? null : Inputs.blankToNull(input.notes());
        events.record("return.accepted", "return_submission", value.id, worker.id, value.id,
                Map.of("itemId", value.item.id.toString(), "quantity", value.quantity));
        return value;
    }

    private static java.math.BigDecimal currentReading(ReturnSubmission value) {
        var current = value.assetInstance != null ? value.assetInstance.operatingHours : value.item.currentOperatingHours;
        return current == null ? java.math.BigDecimal.ZERO : current;
    }

    /** Runtime-tracked items need the hours run (or the new meter reading) before they go back to stock. */
    private java.math.BigDecimal runtimeReading(ReturnSubmission value, ApiModels.ReturnDecisionInput input) {
        var hours = input == null ? null : input.hoursRun();
        var meter = input == null ? null : input.meterReading();
        if (hours != null && meter != null) throw ApiException.badRequest("Provide either hoursRun or meterReading");
        if (hours == null && meter == null) {
            if (value.item.tracksRuntime) throw ApiException.badRequest("Record the hours run before returning " + value.item.name + " to stock");
            return null;
        }
        var reading = meter != null ? meter : currentReading(value).add(hours);
        if (reading.compareTo(currentReading(value)) < 0) throw ApiException.badRequest("The meter reading cannot be lower than " + currentReading(value));
        return reading;
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand(usage = true)
    public ReturnSubmission reject(UUID id, ApiModels.ReturnDecisionInput input) {
        actors.requireWarehouse();
        var value = pendingForDecision(id);
        var worker = actors.current();
        if (value.assetInstance != null) {
            var asset = orm.requireLockedFresh(AssetInstance.class, value.assetInstance.id, "Asset instance");
            if (asset.active && asset.item.id.equals(value.item.id)
                    && asset.availabilityStatus == DomainEnums.AssetState.returned_pending_check
                    && value.pendingAssetVersion != null && asset.version == value.pendingAssetVersion
                    && (value.previousAssetState == DomainEnums.AssetState.in_field
                        || value.previousAssetState == DomainEnums.AssetState.in_custody)
                    && custody.hasOutstandingAsset(asset.id)) {
                asset.availabilityStatus = value.previousAssetState;
            }
        }
        value.status = DomainEnums.ReturnSubmissionStatus.rejected;
        value.acknowledgedBy = worker;
        value.acknowledgedAt = Instant.now();
        value.acknowledgementNotes = input == null ? null : Inputs.blankToNull(input.notes());
        events.record("return.rejected", "return_submission", value.id, worker.id, value.id,
                Map.of("itemId", value.item.id.toString(), "quantity", value.quantity));
        return value;
    }

    @Transactional
    public List<ReturnSubmission> list(DomainEnums.ReturnSubmissionStatus status) {
        var actor = actors.current();
        return orm.list(status, actor, canManageReturns(actor));
    }

    /**
     * Open damage the reviewer must see: reports on the returned asset, or for bulk items those filed by the
     * returning people or against the same order, plus their open contributor damage requests.
     */
    public Map<UUID, List<ApiResponses.ReturnDamageResponse>> reportedDamage(List<ReturnSubmission> submissions) {
        var items = submissions.stream().map(value -> value.item.id).collect(java.util.stream.Collectors.toSet());
        var reports = orm.openDamage(items);
        var requests = orm.openMemberDamage(items);
        var result = new java.util.HashMap<UUID, List<ApiResponses.ReturnDamageResponse>>();
        for (var value : submissions) {
            var damage = new java.util.ArrayList<ApiResponses.ReturnDamageResponse>();
            reports.stream().filter(report -> concerns(value, report)).map(report -> new ApiResponses.ReturnDamageResponse(
                    report.id, report.assetInstance == null ? null : report.assetInstance.assetCode, report.quantity,
                    report.severity.name(), report.status.name(), report.description, report.reporter.name, report.createdAt))
                    .forEach(damage::add);
            requests.stream().filter(request -> concerns(value, request)).map(request -> new ApiResponses.ReturnDamageResponse(
                    request.id, null, request.quantity, null, request.status, request.notes, request.requester.name, request.createdAt))
                    .forEach(damage::add);
            result.put(value.id, damage);
        }
        return result;
    }

    /** Asset damage requests carry a damage report; only bulk requests stand on their own. */
    private static boolean concerns(ReturnSubmission value, MemberRequest request) {
        return value.assetInstance == null && request.item.id.equals(value.item.id)
                && (request.requester.id.equals(value.returnedFor.id) || request.requester.id.equals(value.submittedBy.id));
    }

    private static boolean concerns(ReturnSubmission value, DamageReport report) {
        if (!report.item.id.equals(value.item.id)) return false;
        if (value.assetInstance != null) {
            return report.assetInstance != null && report.assetInstance.id.equals(value.assetInstance.id);
        }
        return report.reporter.id.equals(value.returnedFor.id) || report.reporter.id.equals(value.submittedBy.id)
                || (value.order != null && report.order != null && report.order.id.equals(value.order.id));
    }

    private ReturnSubmission pendingForDecision(UUID id) {
        var submitted = orm.require(ReturnSubmission.class, id, "Return submission");
        // Match order commands: order -> item -> asset. Serialize decisions last.
        if (submitted.order != null)
            orm.requireLockedFresh(InventoryOrder.class, submitted.order.id, "Faction order");
        orm.requireLockedFresh(Item.class, submitted.item.id, "Item");
        if (submitted.assetInstance != null)
            orm.requireLockedFresh(AssetInstance.class, submitted.assetInstance.id, "Asset instance");
        var value = orm.findLocked(id);
        if (value == null) throw ApiException.notFound("Return submission not found");
        if (value.status != DomainEnums.ReturnSubmissionStatus.pending) {
            throw ApiException.conflict("Return submission has already been processed");
        }
        return value;
    }

    private boolean canManageReturns(UserAccount actor) {
        return actor.role.atLeast(DomainEnums.UserRole.warehouse_crew);
    }



}
