package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EquipmentCommitment;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.persistence.EquipmentOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.*;

@ApplicationScoped
public class EquipmentService {
    @Inject org.ash.inventory.operations.internal.persistence.EquipmentOrm orm;
    @Inject ActorService actors;
    @Inject DomainEventService events;
    @Inject StockReadService stockReads;
    @Inject EquipmentPolicy policy;
    @Inject CheckoutEligibility eligibility;
    @Inject MaintenanceEvaluationService maintenance;

    public record ProfileInput(@NotNull Item.Ownership ownershipType, @Size(max=255) String ownerName,
            @Size(max=255) String keeperName, @Size(max=255) String keeperContact,
            @NotNull Item.AvailabilityPolicy availabilityPolicy, @NotNull Long revision,
            @NotBlank @Size(max=255) String reason) {}
    public record CommitmentInput(UUID eventId, @Min(1) int quantity, List<UUID> assetIds,
            @NotNull LocalDate availableFrom, @NotNull LocalDate availableUntil,
            @NotBlank @Size(max=255) String pickupDetails, LocalDate returnDue,
            @Size(max=255) String returnDetails, @NotBlank @Size(max=255) String notes,
            @NotNull Long revision) {}
    public record CancelInput(@NotNull Long revision, @NotBlank @Size(max=255) String reason) {}
    public record CommitmentView(UUID id, UUID eventId, String eventName, int quantity, List<String> assetIds,
            LocalDate availableFrom, LocalDate availableUntil, String pickupDetails, LocalDate returnDue,
            String returnDetails, String notes, String status, String cancellationReason, String recordedBy) {}
    public record Profile(UUID itemId, Item.Ownership ownershipType, String ownerName, String keeperName,
            String keeperContact, Item.AvailabilityPolicy availabilityPolicy, long revision,
            List<CommitmentView> commitments) {}

    @Transactional
    public Profile get(UUID itemId) { return view(item(itemId, false)); }

    public record Availability(int available, List<String> assetIds, boolean pickupAllowed) {}
    @Transactional
    public Map<UUID, Availability> availability(UUID eventId) {
        var actor = actors.current();
        var event = eventId == null ? null : orm.find(EventOccurrence.class, eventId);
        if (eventId != null && event == null) throw ApiException.notFound("Event not found");
        var result = new LinkedHashMap<UUID, Availability>();
        var items = orm.activeItems().stream().filter(i -> actors.canViewItem(i, actor) && !policy.freelyAvailable(i)).toList();
        var stock = stockReads.readStock(items);
        for (var item : items) {
            var read = stock.get(item.id);
            var c = policy.matching(item, event, read.policy().commitments());
            boolean pickupAllowed = c != null && !BusinessTime.today().isBefore(c.availableFrom) && !BusinessTime.today().isAfter(c.availableUntil);
            var loan = c == null ? null : read.policy().loan(c);
            var eligible = c == null ? List.<String>of() : loan == null ? c.assetIds
                    : loan.collectedAssets.stream().filter(id -> !loan.returnedAssets.contains(id)).toList();
            result.put(item.id, new Availability(policy.available(item, event, read.physical(), 0, read.policy()), eligible, pickupAllowed));
        }
        return result;
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Profile update(UUID itemId, ProfileInput input) {
        var item = item(itemId, true); actors.requireItemEdit(item); revision(item, input.revision());
        if (item.accessPolicy != null && (input.availabilityPolicy() == Item.AvailabilityPolicy.available
                || item.accessPolicy.publicUse && input.availabilityPolicy() != Item.AvailabilityPolicy.commitment_required))
            throw ApiException.badRequest("Private equipment cannot be freely available; offered equipment requires owner commitments");
        if (input.ownershipType() != Item.Ownership.organization &&
                (blank(input.ownerName()) || input.availabilityPolicy() == Item.AvailabilityPolicy.available))
            throw ApiException.badRequest("Private/external equipment needs an owner and an explicit commitment or unavailable policy");
        boolean policyChange = item.ownershipType != input.ownershipType() || !Objects.equals(item.ownerName, clean(input.ownerName()))
                || item.availabilityPolicy != input.availabilityPolicy();
        if (policyChange) {
            requireIdle(item);
            if (policy.commitments(item).stream().anyMatch(c -> !c.cancelled && !c.availableUntil.isBefore(BusinessTime.today())))
                throw ApiException.conflict("Cancel current and future commitments before changing ownership or availability policy");
        }
        var before = view(item);
        item.ownershipType = input.ownershipType(); item.ownerName = clean(input.ownerName());
        item.keeperName = clean(input.keeperName()); item.keeperContact = clean(input.keeperContact());
        item.availabilityPolicy = input.availabilityPolicy(); item.equipmentRevision++;
        audit(item, "profile_changed", Map.of("reason", input.reason(), "before", before, "after", view(item)));
        return view(item);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Profile commit(UUID itemId, CommitmentInput input) {
        var item = item(itemId, true); actors.requireItemEdit(item); revision(item, input.revision());
        if (item.availabilityPolicy != Item.AvailabilityPolicy.commitment_required)
            throw ApiException.conflict("Select commitment required before recording an offer");
        if (input.availableUntil().isBefore(input.availableFrom()) || input.availableUntil().isBefore(BusinessTime.today()))
            throw ApiException.badRequest("Commitment needs an ordered, current or future date range");
        var event = input.eventId() == null ? null : orm.find(EventOccurrence.class, input.eventId());
        if (input.eventId() != null && event == null) throw ApiException.notFound("Event not found");
        if (event != null && (input.availableFrom().isAfter(event.startDate) || input.availableUntil().isBefore(event.endDate)))
            throw ApiException.badRequest("Commitment must cover the entire event");
        if ((!item.consumable() && (input.returnDue() == null || blank(input.returnDetails())))
                || (input.returnDue() != null && input.returnDue().isBefore(input.availableUntil())))
            throw ApiException.badRequest("Returnable equipment needs return instructions and a due date on or after the commitment ends");
        // One overlapping offer per pool avoids promising the same bulk units or assets to multiple events.
        LocalDate until = input.returnDue() == null ? input.availableUntil() : input.returnDue();
        if (policy.commitments(item).stream().anyMatch(c -> !c.cancelled && !input.availableFrom().isAfter(end(c)) && !until.isBefore(c.availableFrom)))
            throw ApiException.conflict("This stock pool already has an overlapping commitment (including its return window)");
        requireIdle(item);
        var state = stockReads.physicalStock(item);
        if (input.quantity() > state.available()) throw ApiException.conflict("Commitment exceeds usable physical stock");
        var ids = input.assetIds() == null ? List.<UUID>of() : input.assetIds();
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            if (ids.size() != input.quantity() || new HashSet<>(ids).size() != ids.size())
                throw ApiException.badRequest("Select the exact committed assets, once each");
            for (var id : ids) {
                var asset = id == null ? null : orm.find(AssetInstance.class, id);
                if (asset == null || !asset.item.id.equals(item.id) || !asset.active || asset.availabilityStatus != DomainEnums.AssetState.available)
                    throw ApiException.conflict("Committed asset is not available for this item");
                eligibility.assertAssetCheckoutAllowed(asset);
            }
        } else if (!ids.isEmpty()) throw ApiException.badRequest("Only serialized equipment can select assets");
        var c = new EquipmentCommitment(); c.item = item; c.event = event; c.quantity = input.quantity();
        c.assetIds = ids.stream().map(UUID::toString).toList(); c.availableFrom = input.availableFrom(); c.availableUntil = input.availableUntil();
        c.pickupDetails = input.pickupDetails().trim(); c.returnDue = input.returnDue(); c.returnDetails = clean(input.returnDetails());
        c.notes = input.notes().trim(); c.recordedBy = actors.current(); orm.persist(c); item.equipmentRevision++;
        audit(item, "committed", Map.of("commitment", commitmentView(c)));
        return view(item);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Profile cancel(UUID itemId, UUID id, CancelInput input) {
        var item = item(itemId, true); actors.requireItemEdit(item); revision(item, input.revision());
        var c = orm.find(EquipmentCommitment.class, id);
        if (c == null || !c.item.id.equals(item.id)) throw ApiException.notFound("Commitment not found");
        if (c.cancelled) return view(item);
        requireIdle(item);
        var loan = policy.loan(c);
        if (loan != null && loan.collected > loan.returned) throw ApiException.conflict("Return collected equipment to the provider before cancellation");
        c.cancelled = true; c.cancellationReason = input.reason().trim(); item.equipmentRevision++;
        audit(item, "commitment_cancelled", Map.of("commitmentId", c.id.toString(), "reason", input.reason()));
        return view(item);
    }

    public void requireIdle(Item item) {
        var state = stockReads.physicalStock(item);
        boolean assetBusy = policy.assets(item).stream().anyMatch(a -> !Set.of(DomainEnums.AssetState.available, DomainEnums.AssetState.damaged,
                DomainEnums.AssetState.in_repair, DomainEnums.AssetState.in_maintenance, DomainEnums.AssetState.written_off).contains(a.availabilityStatus));
        if (state.reserved() > 0 || state.checkedOut() > 0 || assetBusy)
            throw ApiException.conflict("Release reservations and reconcile custody/transfers before changing this agreement");
        // Missing and in-transit bulk equipment must not become a new owner's stock by metadata change.
        long missing = orm.missingOrderLines(item);
        long transit = orm.inTransitPositions(item);
        if (missing > 0 || transit > 0) throw ApiException.conflict("Resolve missing or in-transit equipment first");
    }

    private Item item(UUID id, boolean lock) {
        var item = lock ? orm.findLocked(Item.class, id) : orm.find(Item.class, id);
        if (item == null || !item.active) throw ApiException.notFound("Item not found");
        actors.requireItemAccess(item); return item;
    }
    private void revision(Item item, Long expected) { if (expected == null || expected != item.equipmentRevision) throw ApiException.conflict("Equipment agreement changed; reload before saving"); }
    private Profile view(Item item) { return new Profile(item.id, item.ownershipType, item.ownerName, item.keeperName, item.keeperContact, item.availabilityPolicy, item.equipmentRevision, policy.commitments(item).stream().map(this::commitmentView).toList()); }
    private CommitmentView commitmentView(EquipmentCommitment c) { return new CommitmentView(c.id, c.event == null ? null : c.event.id, c.event == null ? null : c.event.name, c.quantity, c.assetIds, c.availableFrom, c.availableUntil, c.pickupDetails, c.returnDue, c.returnDetails, c.notes, c.cancelled ? "cancelled" : c.availableUntil.isBefore(BusinessTime.today()) ? "expired" : c.availableFrom.isAfter(BusinessTime.today()) ? "scheduled" : "active", c.cancellationReason, c.recordedBy.name); }
    private void audit(Item item, String action, Map<String, Object> detail) { events.record("equipment." + action, "item", item.id, actors.current().id, null, detail); }
    private static LocalDate end(EquipmentCommitment c) { return c.returnDue == null ? c.availableUntil : c.returnDue; }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static String clean(String value) { return blank(value) ? null : value.trim(); }
}
