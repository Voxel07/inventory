package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EquipmentCommitment;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.LoanArrangement;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.EquipmentOrm;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.LocalDate;
import java.util.*;
/** Availability policy and its read collaborators; no inventory or equipment commands. */
@ApplicationScoped
public class EquipmentPolicy {
    @Inject org.ash.inventory.operations.internal.persistence.EquipmentOrm orm;
    @Inject MaintenanceEvaluationService maintenance;
    @Inject CheckoutEligibility eligibility;
    public static boolean freelyAvailable(Item item) {
        return item.accessPolicy == null && item.ownershipType == Item.Ownership.organization
                && item.availabilityPolicy == Item.AvailabilityPolicy.available;
    }

    /** Event-less catalog totals deliberately exclude event-bound offers. */
    public int available(Item item, EventOccurrence event, StockState state, int ownReservation) {
        return available(item, event, state, ownReservation, new AvailabilityData() {
            public boolean hasMemberDamage() { return EquipmentPolicy.this.hasMemberDamage(item); }
            public boolean itemUsable() {
                return maintenance.itemUsable(item, java.time.Instant.now());
            }
            public List<EquipmentCommitment> commitments() { return EquipmentPolicy.this.commitments(item); }
            public LoanArrangement loan(EquipmentCommitment commitment) { return EquipmentPolicy.this.loan(commitment); }
            public List<AssetInstance> assets() { return EquipmentPolicy.this.assets(item); }
            public boolean usable(AssetInstance asset) { return EquipmentPolicy.this.usable(asset); }
            public int consumedDuring(EquipmentCommitment commitment) { return EquipmentPolicy.this.consumedDuring(item, commitment); }
            public int internalQuantity(UUID providerId) {
                return orm.internalPositions(item, providerId)
                        .mapToInt(InventoryPosition::availableQuantity).sum();
            }
        });
    }

    /** Both live workflows and planning snapshots use the same availability rules. */
    public interface AvailabilityData {
        boolean hasMemberDamage();
        boolean itemUsable();
        /** Item-level eligibility (contributor-damage hold, maintenance) shared by commands, planning, reports and MCP. */
        default boolean eligible() { return !hasMemberDamage() && itemUsable(); }
        List<EquipmentCommitment> commitments();
        LoanArrangement loan(EquipmentCommitment commitment);
        List<AssetInstance> assets();
        boolean usable(AssetInstance asset);
        int consumedDuring(EquipmentCommitment commitment);
        int internalQuantity(UUID providerId);
    }

    public int available(Item item, EventOccurrence event, StockState state,
            int ownReservation, AvailabilityData data) {
        if (!data.eligible()) return 0;
        if (freelyAvailable(item)) {
            if (item.trackingMode != DomainEnums.TrackingMode.serialized) return state.available() + ownReservation;
            var eligible = data.assets().stream().filter(data::usable).toList();
            int free = eligible.stream().mapToInt(a -> StockPolicy.classify(a).available()).sum();
            int reserved = eligible.stream().mapToInt(a -> StockPolicy.classify(a).reserved()).sum();
            return free + Math.min(ownReservation, reserved);
        }
        if (item.availabilityPolicy != Item.AvailabilityPolicy.commitment_required) return 0;
        var c = matching(item, event, data.commitments());
        if (c == null) return 0;
        var agreement = data.loan(c);
        if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
            var eligibleIds = agreement == null ? c.assetIds : agreement.collectedAssets.stream()
                    .filter(id -> !agreement.returnedAssets.contains(id)).toList();
            var eligible = data.assets().stream().filter(a -> eligibleIds.contains(a.id.toString()) && data.usable(a) && (agreement == null || a.currentLocation == null || !a.currentLocation.id.equals(agreement.providerLocation.id))).toList();
            int free = eligible.stream().mapToInt(a -> StockPolicy.classify(a).available()).sum();
            int reserved = eligible.stream().mapToInt(a -> StockPolicy.classify(a).reserved()).sum();
            return free + Math.min(ownReservation, reserved);
        }
        int consumed = item.consumable() ? data.consumedDuring(c) : 0;
        int physical = state.available() + ownReservation;
        if (agreement != null) {
            int internal = data.internalQuantity(agreement.providerLocation.id);
            physical = Math.min(physical, Math.max(0, internal - Math.max(0, state.reserved() - ownReservation)));
        }
        return Math.min(physical,
                Math.max(0, (agreement == null ? c.quantity : agreement.collected - agreement.returned)
                        - state.checkedOut() - consumed - Math.max(0, state.reserved() - ownReservation)));
    }

    public boolean hasMemberDamage(Item item) {
        return orm.openMemberDamage(item) > 0;
    }
    public void assertPickup(Item item, EventOccurrence event) {
        if (hasMemberDamage(item)) throw ApiException.conflict("Warehouse must review the open contributor damage report before checkout");
        if (freelyAvailable(item)) return;
        var c = matching(item, event);
        var today = BusinessTime.today();
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
        if (!isInternalSource(item, source))
            throw ApiException.conflict("Choose an internal location; collect provider-held equipment before issuing it");
    }

    /** False for provider-held locations of an open loan, the only places stock may not be issued from. */
    public boolean isInternalSource(Item item, StorageLocation source) {
        return internalSources(item).test(source);
    }

    /** {@link #isInternalSource} for many candidate locations from one loan read. */
    public java.util.function.Predicate<StorageLocation> internalSources(Item item) {
        var loans = orm.openLoans(item);
        return source -> loans.isEmpty() || (source != null && loans.stream().noneMatch(l -> l.providerLocation.id.equals(source.id)));
    }
    public LoanArrangement loan(EquipmentCommitment c) {
        return orm.commitmentLoans(c).findFirst().orElse(null);
    }
    private int eligibleQuantity(EquipmentCommitment c) { var l = loan(c); return l == null ? c.quantity : l.collected - l.returned; }
    private List<String> eligibleAssets(EquipmentCommitment c) { var l = loan(c); return l == null ? c.assetIds : l.collectedAssets.stream().filter(id -> !l.returnedAssets.contains(id)).toList(); }

    public EquipmentCommitment matching(Item item, EventOccurrence event) {
        if (item.availabilityPolicy != Item.AvailabilityPolicy.commitment_required) return null;
        return matching(item, event, commitments(item));
    }

    public EquipmentCommitment matching(Item item, EventOccurrence event, List<EquipmentCommitment> commitments) {
        LocalDate from = event == null ? BusinessTime.today() : event.startDate;
        LocalDate until = event == null ? from : event.endDate;
        return commitments.stream().filter(c -> !c.cancelled && (c.event == null || (event != null && c.event.id.equals(event.id)))
                && !c.availableFrom.isAfter(from) && !c.availableUntil.isBefore(until)).findFirst().orElse(null);
    }

    private int consumedDuring(Item item, EquipmentCommitment c) {
        return orm.consumption(item)
                .filter(t -> !BusinessTime.date(t.createdAt).isBefore(c.availableFrom))
                .mapToInt(t -> t.quantity).sum();
    }

    private boolean usable(AssetInstance a) {
        try { eligibility.assertAssetCheckoutAllowed(a); return a.active; } catch (ApiException ex) { return false; }
    }
    public List<AssetInstance> assets(Item item) { return orm.activeAssets(item); }
    public List<EquipmentCommitment> commitments(Item item) { return orm.commitments(item); }
}
