package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiException;
import java.time.LocalDate;
import java.util.*;

@ApplicationScoped
public class EquipmentService {
    @Inject EntityManager em;
    @Inject ActorService actors;
    @Inject DomainEventService events;
    @Inject InventoryOperationsService inventory;

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
        var event = eventId == null ? null : em.find(EventOccurrence.class, eventId);
        if (eventId != null && event == null) throw ApiException.notFound("Event not found");
        var result = new LinkedHashMap<UUID, Availability>();
        for (var item : em.createQuery("from Item i where i.active = true", Item.class).getResultList()) {
            if (!actors.canViewItem(item, actor) || freelyAvailable(item)) continue;
            var c = matching(item, event);
            boolean pickupAllowed = c != null && !LocalDate.now().isBefore(c.availableFrom) && !LocalDate.now().isAfter(c.availableUntil);
            result.put(item.id, new Availability(inventory.availableFor(item, event, 0), c == null ? List.of() : eligibleAssets(c), pickupAllowed));
        }
        return result;
    }

    @Transactional
    public Profile update(UUID itemId, ProfileInput input) {
        actors.requireWarehouse();
        var item = item(itemId, true); revision(item, input.revision());
        if (input.ownershipType() != Item.Ownership.organization &&
                (blank(input.ownerName()) || input.availabilityPolicy() == Item.AvailabilityPolicy.available))
            throw ApiException.badRequest("Private/external equipment needs an owner and an explicit commitment or unavailable policy");
        boolean policyChange = item.ownershipType != input.ownershipType() || !Objects.equals(item.ownerName, clean(input.ownerName()))
                || item.availabilityPolicy != input.availabilityPolicy();
        if (policyChange) {
            requireIdle(item);
            if (commitments(item).stream().anyMatch(c -> !c.cancelled && !c.availableUntil.isBefore(LocalDate.now())))
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
    public Profile commit(UUID itemId, CommitmentInput input) {
        actors.requireWarehouse();
        var item = item(itemId, true); revision(item, input.revision());
        if (item.availabilityPolicy != Item.AvailabilityPolicy.commitment_required)
            throw ApiException.conflict("Select commitment required before recording an offer");
        if (input.availableUntil().isBefore(input.availableFrom()) || input.availableUntil().isBefore(LocalDate.now()))
            throw ApiException.badRequest("Commitment needs an ordered, current or future date range");
        var event = input.eventId() == null ? null : em.find(EventOccurrence.class, input.eventId());
        if (input.eventId() != null && event == null) throw ApiException.notFound("Event not found");
        if (event != null && (input.availableFrom().isAfter(event.startDate) || input.availableUntil().isBefore(event.endDate)))
            throw ApiException.badRequest("Commitment must cover the entire event");
        if ((!item.consumable && (input.returnDue() == null || blank(input.returnDetails())))
                || (input.returnDue() != null && input.returnDue().isBefore(input.availableUntil())))
            throw ApiException.badRequest("Returnable equipment needs return instructions and a due date on or after the commitment ends");
        // One overlapping offer per pool avoids promising the same bulk units or assets to multiple events.
        LocalDate until = input.returnDue() == null ? input.availableUntil() : input.returnDue();
        if (commitments(item).stream().anyMatch(c -> !c.cancelled && !input.availableFrom().isAfter(end(c)) && !until.isBefore(c.availableFrom)))
            throw ApiException.conflict("This stock pool already has an overlapping commitment (including its return window)");
        requireIdle(item);
        var state = inventory.physicalStock(item);
        if (input.quantity() > state.available()) throw ApiException.conflict("Commitment exceeds usable physical stock");
        var ids = input.assetIds() == null ? List.<UUID>of() : input.assetIds();
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            if (ids.size() != input.quantity() || new HashSet<>(ids).size() != ids.size())
                throw ApiException.badRequest("Select the exact committed assets, once each");
            for (var id : ids) {
                var asset = id == null ? null : em.find(AssetInstance.class, id);
                if (asset == null || !asset.item.id.equals(item.id) || !asset.active || asset.availabilityStatus != DomainEnums.AssetState.available)
                    throw ApiException.conflict("Committed asset is not available for this item");
                inventory.assertAssetCheckoutAllowed(asset);
            }
        } else if (!ids.isEmpty()) throw ApiException.badRequest("Only serialized equipment can select assets");
        var c = new EquipmentCommitment(); c.item = item; c.event = event; c.quantity = input.quantity();
        c.assetIds = ids.stream().map(UUID::toString).toList(); c.availableFrom = input.availableFrom(); c.availableUntil = input.availableUntil();
        c.pickupDetails = input.pickupDetails().trim(); c.returnDue = input.returnDue(); c.returnDetails = clean(input.returnDetails());
        c.notes = input.notes().trim(); c.recordedBy = actors.current(); em.persist(c); item.equipmentRevision++;
        audit(item, "committed", Map.of("commitment", commitmentView(c)));
        return view(item);
    }

    @Transactional
    public Profile cancel(UUID itemId, UUID id, CancelInput input) {
        actors.requireWarehouse(); var item = item(itemId, true); revision(item, input.revision());
        var c = em.find(EquipmentCommitment.class, id);
        if (c == null || !c.item.id.equals(item.id)) throw ApiException.notFound("Commitment not found");
        if (c.cancelled) return view(item);
        requireIdle(item);
        var loan = loan(c);
        if (loan != null && loan.collected > loan.returned) throw ApiException.conflict("Return collected equipment to the provider before cancellation");
        c.cancelled = true; c.cancellationReason = input.reason().trim(); item.equipmentRevision++;
        audit(item, "commitment_cancelled", Map.of("commitmentId", c.id.toString(), "reason", input.reason()));
        return view(item);
    }

    public static boolean freelyAvailable(Item item) {
        return item.ownershipType == Item.Ownership.organization && item.availabilityPolicy == Item.AvailabilityPolicy.available;
    }

    /** Event-less catalog totals deliberately exclude event-bound offers. */
    public int available(Item item, EventOccurrence event, InventoryOperationsService.StockState state, int ownReservation) {
        if (hasMemberDamage(item)) return 0;
        if (freelyAvailable(item)) return state.available() + ownReservation;
        var c = matching(item, event);
        if (c == null) return 0;
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            var eligibleIds = eligibleAssets(c);
            var agreement = loan(c);
            var eligible = assets(item).stream().filter(a -> eligibleIds.contains(a.id.toString()) && usable(a) && (agreement == null || a.currentLocation == null || !a.currentLocation.id.equals(agreement.providerLocation.id))).toList();
            int free = (int) eligible.stream().filter(a -> a.availabilityStatus == DomainEnums.AssetState.available).count();
            int reserved = (int) eligible.stream().filter(a -> a.availabilityStatus == DomainEnums.AssetState.reserved || a.availabilityStatus == DomainEnums.AssetState.staged).count();
            return free + Math.min(ownReservation, reserved);
        }
        int consumed = item.consumable ? consumedDuring(item, c) : 0;
        var agreement = loan(c);
        int physical = state.available() + ownReservation;
        if (agreement != null) {
            int internal = em.createQuery("from InventoryPosition p where p.item = :item and p.location <> :provider", InventoryPosition.class)
                    .setParameter("item", item).setParameter("provider", agreement.providerLocation).getResultStream().mapToInt(InventoryPosition::availableQuantity).sum();
            physical = Math.min(physical, Math.max(0, internal - Math.max(0, state.reserved() - ownReservation)));
        }
        return Math.min(physical,
                Math.max(0, eligibleQuantity(c) - state.checkedOut() - consumed - Math.max(0, state.reserved() - ownReservation)));
    }

    public boolean hasMemberDamage(Item item) {
        return em.createQuery("select count(r) from MemberRequest r where r.item = :item and r.kind = 'damage' and r.status <> 'resolved'", Long.class).setParameter("item", item).getSingleResult() > 0;
    }
    public void assertPickup(Item item, EventOccurrence event) {
        if (hasMemberDamage(item)) throw ApiException.conflict("Warehouse must review the open contributor damage report before checkout");
        if (freelyAvailable(item)) return;
        var c = matching(item, event);
        var today = LocalDate.now();
        if (c == null || eligibleQuantity(c) == 0 || today.isBefore(c.availableFrom) || today.isAfter(c.availableUntil))
            throw ApiException.conflict("No equipment commitment permits pickup today for this event/date range");
    }

    public void assertAsset(AssetInstance asset, EventOccurrence event) {
        assertSource(asset.item, asset.currentLocation);
        if (freelyAvailable(asset.item)) return;
        var c = matching(asset.item, event);
        if (c == null || !eligibleAssets(c).contains(asset.id.toString()))
            throw ApiException.conflict("Asset " + asset.assetCode + " is not committed for this event/date range");
    }

    public void assertSource(Item item, StorageLocation source) {
        var loans = em.createQuery("from LoanArrangement l where l.commitment.item = :item and l.commitment.cancelled = false and l.returned < l.commitment.quantity", LoanArrangement.class).setParameter("item", item).getResultList();
        if (!loans.isEmpty() && (source == null || loans.stream().anyMatch(l -> l.providerLocation.id.equals(source.id))))
            throw ApiException.conflict("Choose an internal location; collect provider-held equipment before issuing it");
    }
    private LoanArrangement loan(EquipmentCommitment c) {
        return em.createQuery("from LoanArrangement l where l.commitment = :c", LoanArrangement.class).setParameter("c", c).getResultStream().findFirst().orElse(null);
    }
    private int eligibleQuantity(EquipmentCommitment c) { var l = loan(c); return l == null ? c.quantity : l.collected - l.returned; }
    private List<String> eligibleAssets(EquipmentCommitment c) { var l = loan(c); return l == null ? c.assetIds : l.collectedAssets.stream().filter(id -> !l.returnedAssets.contains(id)).toList(); }

    private EquipmentCommitment matching(Item item, EventOccurrence event) {
        if (item.availabilityPolicy != Item.AvailabilityPolicy.commitment_required) return null;
        LocalDate from = event == null ? LocalDate.now() : event.startDate;
        LocalDate until = event == null ? from : event.endDate;
        return commitments(item).stream().filter(c -> !c.cancelled && (c.event == null || (event != null && c.event.id.equals(event.id)))
                && !c.availableFrom.isAfter(from) && !c.availableUntil.isBefore(until)).findFirst().orElse(null);
    }

    private int consumedDuring(Item item, EquipmentCommitment c) {
        return em.createQuery("from StockTransaction t where t.item = :item and t.type = :type", StockTransaction.class)
                .setParameter("item", item).setParameter("type", DomainEnums.TransactionType.consumed).getResultStream()
                .filter(t -> !t.createdAt.atZone(java.time.ZoneId.systemDefault()).toLocalDate().isBefore(c.availableFrom))
                .mapToInt(t -> t.quantity).sum();
    }

    public void requireIdle(Item item) {
        var state = inventory.physicalStock(item);
        boolean assetBusy = assets(item).stream().anyMatch(a -> !Set.of(DomainEnums.AssetState.available, DomainEnums.AssetState.damaged,
                DomainEnums.AssetState.in_repair, DomainEnums.AssetState.in_maintenance, DomainEnums.AssetState.written_off).contains(a.availabilityStatus));
        if (state.reserved() > 0 || state.checkedOut() > 0 || assetBusy)
            throw ApiException.conflict("Release reservations and reconcile custody/transfers before changing this agreement");
        // Missing and in-transit bulk equipment must not become a new owner's stock by metadata change.
        long missing = em.createQuery("select count(l) from FactionOrderLine l where l.item = :item and l.missingQuantity > 0", Long.class).setParameter("item", item).getSingleResult();
        boolean generalMissing = em.createQuery("from GeneralOrder", GeneralOrder.class).getResultStream().anyMatch(o -> o.missingQuantities.getOrDefault(item.id.toString(), 0) > 0);
        long transit = em.createQuery("select count(p) from InventoryPosition p where p.item = :item and p.quantityInTransit > 0", Long.class).setParameter("item", item).getSingleResult();
        if (missing > 0 || generalMissing || transit > 0) throw ApiException.conflict("Resolve missing or in-transit equipment first");
    }

    private boolean usable(AssetInstance a) {
        try { inventory.assertAssetCheckoutAllowed(a); return a.active; } catch (ApiException ex) { return false; }
    }
    private List<AssetInstance> assets(Item item) { return em.createQuery("from AssetInstance a where a.item = :item and a.active = true", AssetInstance.class).setParameter("item", item).getResultList(); }
    private List<EquipmentCommitment> commitments(Item item) { return em.createQuery("from EquipmentCommitment c where c.item = :item order by c.availableFrom desc, c.createdAt desc", EquipmentCommitment.class).setParameter("item", item).getResultList(); }
    private Item item(UUID id, boolean lock) {
        var item = lock ? em.find(Item.class, id, LockModeType.PESSIMISTIC_WRITE) : em.find(Item.class, id);
        if (item == null || !item.active) throw ApiException.notFound("Item not found");
        actors.requireItemAccess(item); return item;
    }
    private void revision(Item item, Long expected) { if (expected == null || expected != item.equipmentRevision) throw ApiException.conflict("Equipment agreement changed; reload before saving"); }
    private Profile view(Item item) { return new Profile(item.id, item.ownershipType, item.ownerName, item.keeperName, item.keeperContact, item.availabilityPolicy, item.equipmentRevision, commitments(item).stream().map(this::commitmentView).toList()); }
    private CommitmentView commitmentView(EquipmentCommitment c) { return new CommitmentView(c.id, c.event == null ? null : c.event.id, c.event == null ? null : c.event.name, c.quantity, c.assetIds, c.availableFrom, c.availableUntil, c.pickupDetails, c.returnDue, c.returnDetails, c.notes, c.cancelled ? "cancelled" : c.availableUntil.isBefore(LocalDate.now()) ? "expired" : c.availableFrom.isAfter(LocalDate.now()) ? "scheduled" : "active", c.cancellationReason, c.recordedBy.name); }
    private void audit(Item item, String action, Map<String, Object> detail) { events.record("equipment." + action, "item", item.id, actors.current().id, null, detail); }
    private static LocalDate end(EquipmentCommitment c) { return c.returnDue == null ? c.availableUntil : c.returnDue; }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static String clean(String value) { return blank(value) ? null : value.trim(); }
}
