package org.ash.inventory.service;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiException;
import java.time.*;
import java.util.*;

@ApplicationScoped
public class LoanService {
    @Inject org.ash.inventory.orm.LoanOrm orm;
    @Inject ActorService actors;
    @Inject EquipmentService equipment;
    @Inject DomainEventService events;
    public record Input(@NotNull UUID commitmentId, @NotNull UUID providerLocationId, @NotBlank String kind,
            @NotBlank @Size(max=255) String provider, @NotBlank @Size(max=255) String contact, @NotBlank @Size(max=2000) String terms) {}
    public record Movement(@NotNull UUID transferId, @NotNull Long revision, @NotBlank @Size(max=255) String notes) {}
    public record Extension(@NotNull LocalDate availableUntil, @NotNull LocalDate returnDue, @NotNull Long revision, @NotBlank @Size(max=255) String reason) {}
    public record View(UUID id, UUID itemId, String item, UUID commitmentId, UUID providerLocationId, String kind, String provider,
            String contact, String terms, int quantity, int collected, int returned, List<String> assetCodes,
            LocalDate collectionDate, LocalDate availableUntil, LocalDate returnDue, String status, long revision, List<Map<String,String>> history) {}
    @Transactional public List<View> list(int page, int size) {
        actors.requireWarehouse(); var bounds = org.ash.inventory.helper.PageBounds.of(page, size);
        var loans = orm.arrangements(bounds.offset(), bounds.limit());
        var codes = orm.assetCodes(loans.stream().flatMap(l -> l.commitment.assetIds.stream()).distinct().toList());
        return loans.stream().map(l -> view(l, codes)).toList();
    }
    @Transactional @org.ash.inventory.helper.security.PrivateInventoryCommand public View create(Input input) {
        actors.requireWarehouse(); var c = orm.find(EquipmentCommitment.class, input.commitmentId());
        if (c == null) throw ApiException.notFound("Commitment not found");
        orm.refreshLocked(c.item); orm.refresh(c);
        if (c.cancelled || c.returnDue == null || c.item.consumable || c.item.ownershipType == Item.Ownership.organization || c.availableUntil.isBefore(LocalDate.now())) throw ApiException.conflict("Use a current returnable private/external commitment");
        equipment.requireIdle(c.item);
        if (orm.commitmentCount(c) > 0) throw ApiException.conflict("Commitment already has an arrangement");
        if (!Set.of("borrow", "rental").contains(input.kind())) throw ApiException.badRequest("Choose borrow or rental");
        var location = orm.find(StorageLocation.class, input.providerLocationId());
        if (location == null || !location.active) throw ApiException.badRequest("Active provider location required");
        var l = new LoanArrangement(); l.commitment = c; l.providerLocation = location; l.kind = input.kind(); l.provider = input.provider().trim(); l.contact = input.contact().trim(); l.terms = input.terms().trim();
        orm.persist(l); history(l, "agreed", l.terms); c.item.equipmentRevision++; return view(l);
    }
    @Transactional @org.ash.inventory.helper.security.PrivateInventoryCommand
    public View move(UUID id, Movement input, boolean returning) {
        var l = locked(id, input.revision()); var c = l.commitment;
        if (l.transferIds.contains(input.transferId().toString())) throw ApiException.conflict("Transfer already recorded");
        if (c.cancelled) throw ApiException.conflict("Arrangement is cancelled");
        var transfer = orm.find(InventoryTransfer.class, input.transferId());
        if (transfer == null || transfer.status != DomainEnums.TransferStatus.received || transfer.createdAt.isBefore(l.createdAt)) throw ApiException.conflict("Use a completed transfer created for this arrangement");
        if (!(returning ? transfer.destinationLocation.id : transfer.sourceLocation.id).equals(l.providerLocation.id)) throw ApiException.conflict("Transfer must use the agreed provider location");
        for (var other : orm.allArrangements())
            if (other.transferIds.contains(transfer.id.toString())) throw ApiException.conflict("Transfer already belongs to an arrangement");
        var lines = orm.transferLines(transfer);
        if (lines.isEmpty() || lines.stream().anyMatch(line -> !line.item.id.equals(c.item.id) || line.discrepancyQuantity > 0 || line.receivedQuantity != line.requestedQuantity)) throw ApiException.conflict("Transfer must contain only this item, fully received without discrepancies");
        int quantity = lines.stream().mapToInt(line -> line.receivedQuantity).sum();
        if (quantity < 1 || quantity > (returning ? l.collected - l.returned : c.quantity - l.collected)) throw ApiException.conflict("Transfer exceeds remaining agreement quantity");
        if (!returning && (LocalDate.now().isBefore(c.availableFrom) || LocalDate.now().isAfter(c.availableUntil))) throw ApiException.conflict("Collection is outside the agreed dates");
        if (returning) equipment.requireIdle(c.item);
        var ids = lines.stream().filter(line -> line.assetInstance != null).map(line -> line.assetInstance.id.toString()).toList();
        if (ids.stream().anyMatch(a -> !c.assetIds.contains(a) || (returning ? !l.collectedAssets.contains(a) || l.returnedAssets.contains(a) : l.collectedAssets.contains(a)))) throw ApiException.conflict("Transfer assets do not match outstanding agreement identities");
        if (returning) { l.returned += quantity; l.returnedAssets = append(l.returnedAssets, ids); }
        else { l.collected += quantity; l.collectedAssets = append(l.collectedAssets, ids); }
        l.transferIds = append(l.transferIds, List.of(transfer.id.toString())); c.item.equipmentRevision++;
        history(l, returning ? "returned" : "collected", quantity + " · " + transfer.transferNumber + " · " + input.notes()); orm.flush(); return view(l);
    }
    @Transactional @org.ash.inventory.helper.security.PrivateInventoryCommand public View extend(UUID id, Extension input) {
        var l = locked(id, input.revision()); var c = l.commitment;
        if (c.cancelled || l.returned == c.quantity || input.availableUntil().isBefore(c.availableUntil) || input.returnDue().isBefore(c.returnDue)
                || input.returnDue().isBefore(input.availableUntil()) || input.availableUntil().isBefore(LocalDate.now())) throw ApiException.conflict("Extension must keep or lengthen both dates on an open arrangement");
        boolean overlap = orm.commitments(c.item)
                .anyMatch(o -> !o.id.equals(c.id) && !o.cancelled && !o.availableFrom.isAfter(input.returnDue()) && !(o.returnDue == null ? o.availableUntil : o.returnDue).isBefore(c.availableFrom));
        if (overlap) throw ApiException.conflict("Extension overlaps another commitment");
        var before = c.availableUntil + " / " + c.returnDue; c.availableUntil = input.availableUntil(); c.returnDue = input.returnDue(); c.item.equipmentRevision++;
        history(l, "extended", before + " → " + c.availableUntil + " / " + c.returnDue + " · " + input.reason()); orm.flush(); return view(l);
    }
    private LoanArrangement locked(UUID id, Long revision) {
        actors.requireWarehouse(); var l = orm.find(LoanArrangement.class, id);
        if (l == null) throw ApiException.notFound("Arrangement not found");
        orm.refreshLocked(l.commitment.item); orm.refreshLocked(l); orm.refresh(l.commitment);
        if (revision == null || revision != l.revision) throw ApiException.conflict("Arrangement changed; reload"); return l;
    }
    private List<String> append(List<String> old, List<String> added) { var result = new ArrayList<>(old); result.addAll(added); return result; }
    private void history(LoanArrangement l, String action, String note) {
        var entry = Map.of("action", action, "at", Instant.now().toString(), "actor", actors.current().name, "notes", note);
        var history = new ArrayList<>(l.history); history.add(entry); l.history = history;
        events.record("loan." + action, "loan_arrangement", l.id, actors.current().id, null, Map.of("itemId", l.commitment.item.id.toString(), "entry", entry));
    }
    private View view(LoanArrangement l) { return view(l, orm.assetCodes(l.commitment.assetIds)); }
    private View view(LoanArrangement l, Map<String, String> codes) { var c = l.commitment; return new View(l.id, c.item.id, c.item.name, c.id, l.providerLocation.id, l.kind, l.provider, l.contact, l.terms, c.quantity, l.collected, l.returned, c.assetIds.stream().map(id -> codes.getOrDefault(id, id)).toList(), c.availableFrom, c.availableUntil, c.returnDue, c.cancelled ? "cancelled" : l.returned == c.quantity ? "returned" : l.returned > 0 ? "partially_returned" : l.collected == c.quantity ? "collected" : l.collected > 0 ? "partially_collected" : "agreed", l.revision, l.history); }
}
