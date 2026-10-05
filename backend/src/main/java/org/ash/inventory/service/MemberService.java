package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.*;
import java.time.Instant;
import java.util.*;

@ApplicationScoped
public class MemberService {
    @Inject org.ash.inventory.orm.MemberOrm orm;
    @Inject ActorService actors;
    @Inject CustodyBalanceService custody;
    @Inject ReturnSubmissionService returns;
    @Inject DomainEventService events;
    public record Stored(UUID itemId, String name, UUID locationId, String location, UUID assetId, String assetCode, int quantity) {}
    public record RequestInput(@NotNull UUID itemId, UUID assetId, UUID locationId,
            @NotBlank String kind, @Min(1) int quantity, @NotBlank @Size(max=2000) String notes, @NotNull UUID commandId) {}
    public record Decision(@NotNull Long revision, @NotBlank @Size(max=2000) String response, boolean resolved) {}
    public record Assignment(UUID userId) {}
    public record LocationView(UUID id, String name, UUID userId) {}
    public record RequestView(UUID id, UUID itemId, String item, String requester, String kind, int quantity,
            String notes, String status, String response, Instant createdAt, long revision, UUID assetId, UUID locationId) {}
    public record ReturnInput(@NotBlank String custodyKey, @Min(1) int quantity, UUID assetId, @Size(max=255) String notes, @NotNull UUID commandId) {}

    @Transactional
    public List<CustodyBalanceService.Balance> custodyRows() {
        var result = new ArrayList<CustodyBalanceService.Balance>();
        var balances = custody.list(true);
        var items = orm.custodyItems(balances.stream().map(CustodyBalanceService.Balance::itemId).distinct().toList());
        var orders = balances.stream().filter(b -> b.factionOrderId() != null && items.get(b.itemId()).trackingMode == DomainEnums.TrackingMode.serialized)
                .map(CustodyBalanceService.Balance::factionOrderId).distinct().toList();
        var assets = orm.custodyAssets(orders).stream().collect(java.util.stream.Collectors.groupingBy(a -> a.order() + ":" + a.item()));
        for (var b : balances) {
            var item = items.get(b.itemId());
            if (b.factionOrderId() == null || item.trackingMode != DomainEnums.TrackingMode.serialized) { result.add(b); continue; }
            for (var candidate : assets.getOrDefault(b.factionOrderId() + ":" + b.itemId(), List.of())) {
                var asset = candidate.asset();
                result.add(new CustodyBalanceService.Balance(b.key() + ":" + asset.id, b.itemId(), b.name() + " · " + asset.assetCode,
                        b.category(), b.storageLocation(), 1, candidate.pending(), b.personId(), b.person(), b.eventKey(), b.event(), b.factionOrderId(), null, asset.id, b.eventOccurrenceId()));
            }
        }
        return result;
    }

    @Transactional
    public List<Stored> stored() {
        var actor = actors.current(); var result = new ArrayList<Stored>();
        for (var p : orm.storedPositions(actor))
            result.add(new Stored(p.item.id, p.item.name, p.location.id, p.location.name, null, null, p.quantityOnHand));
        for (var a : orm.storedAssets(actor))
            result.add(new Stored(a.item.id, a.item.name, a.currentLocation.id, a.currentLocation.name, a.id, a.assetCode, 1));
        return result;
    }
    @Transactional
    public List<LocationView> assignments() {
        actors.requireWarehouse();
        return orm.locations()
                .map(l -> new LocationView(l.id, l.name, l.keeperUser == null ? null : l.keeperUser.id)).toList();
    }
    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public void assign(UUID id, Assignment input) {
        actors.requireWarehouse(); var l = orm.findLocked(StorageLocation.class, id);
        if (l == null) throw ApiException.notFound("Location not found");
        var user = input.userId() == null ? null : orm.find(UserAccount.class, input.userId());
        if (input.userId() != null && (user == null || user.role == DomainEnums.UserRole.read_only)) throw ApiException.badRequest("Choose a contributor account");
        l.keeperUser = user;
        events.record("location.keeper_assigned", "storage_location", id, actors.current().id, null, Map.of("userId", user == null ? "" : user.id.toString()));
    }
    @Transactional
    public List<RequestView> requests(int page, int size) {
        var actor = actors.current(); boolean staff = staff();
        var bounds = org.ash.inventory.helper.PageBounds.of(page, size);
        return orm.requests(actor, staff, bounds.offset(), bounds.limit()).stream().map(this::view).toList();
    }
    @Transactional
    public RequestView request(RequestInput input) {
        writable(); var actor = actors.current();
        var prior = orm.requestCommands(input.commandId()).findFirst().orElse(null);
        if (prior != null) { if (!prior.requester.id.equals(actor.id)) throw ApiException.conflict("Command already used"); return view(prior); }
        var item = orm.findLocked(Item.class, input.itemId());
        if (item == null) throw ApiException.notFound("Item not found");
        prior = orm.requestCommands(input.commandId()).findFirst().orElse(null);
        if (prior != null) { if (!prior.requester.id.equals(actor.id)) throw ApiException.conflict("Command already used"); return view(prior); }
        if (!Set.of("damage", "pickup").contains(input.kind())) throw ApiException.badRequest("Choose damage or pickup");
        boolean stored = stored().stream().anyMatch(s -> s.itemId().equals(item.id) && Objects.equals(s.locationId(), input.locationId())
                && Objects.equals(s.assetId(), input.assetId()) && s.quantity() >= input.quantity());
        boolean held = input.locationId() == null && custodyRows().stream().anyMatch(b -> b.itemId().equals(item.id)
                && Objects.equals(b.assetInstanceId(), input.assetId()) && b.checkedOut() >= input.quantity());
        if (!stored && !held) throw ApiException.forbidden("Equipment must be in your custody or explicitly assigned storage");
        var r = new MemberRequest(); r.requester = actor; r.item = item; r.asset = input.assetId() == null ? null : orm.find(AssetInstance.class, input.assetId());
        r.location = input.locationId() == null ? null : orm.find(StorageLocation.class, input.locationId()); r.kind = input.kind();
        r.quantity = input.quantity(); r.notes = input.notes().trim(); r.commandId = input.commandId(); orm.persist(r);
        events.record("member_request.created", "member_request", r.id, actor.id, input.commandId(), Map.of("kind", r.kind, "itemId", item.id.toString()));
        return view(r);
    }
    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public RequestView decide(UUID id, Decision input) {
        actors.requireWarehouse(); var r = orm.findLocked(MemberRequest.class, id);
        if (r == null) throw ApiException.notFound("Request not found");
        if (r.revision != input.revision() || r.status.equals("resolved")) throw ApiException.conflict("Request changed; reload");
        r.response = input.response().trim(); r.status = input.resolved() ? "resolved" : "coordinating"; r.handledBy = actors.current(); r.handledAt = Instant.now();
        events.record("member_request.responded", "member_request", r.id, actors.current().id, null, Map.of("response", r.response, "status", r.status));
        orm.flush(); return view(r);
    }
    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public UUID submitReturn(ReturnInput input) {
        writable(); var actor = actors.current();
        var prior = orm.returnCommands(input.commandId()).findFirst().orElse(null);
        if (prior != null) { if (!prior.returnedFor.id.equals(actor.id)) throw ApiException.conflict("Command already used"); return prior.id; }
        var row = custodyRows().stream().filter(b -> b.key().equals(input.custodyKey())).findFirst().orElseThrow(() -> ApiException.notFound("Custody not found"));
        orm.findLocked(Item.class, row.itemId());
        prior = orm.returnCommands(input.commandId()).findFirst().orElse(null);
        if (prior != null) { if (!prior.returnedFor.id.equals(actor.id)) throw ApiException.conflict("Command already used"); return prior.id; }
        row = custodyRows().stream().filter(b -> b.key().equals(input.custodyKey())).findFirst().orElseThrow(() -> ApiException.conflict("Custody changed"));
        if (input.quantity() > row.checkedOut() - row.pendingQuantity()) throw ApiException.conflict("Quantity already submitted or no longer outstanding");
        if (row.generalOrderId() == null) { var result = returns.create(new ApiModels.ReturnSubmissionInput(row.itemId(), input.quantity(),
                row.assetInstanceId() == null ? input.assetId() : row.assetInstanceId(), actor.id, row.factionOrderId(), null, input.notes(), row.eventOccurrenceId())); result.memberCommandId = input.commandId(); return result.id; }
        var r = new ReturnSubmission(); r.item = orm.find(Item.class, row.itemId()); r.generalOrder = orm.find(GeneralOrder.class, row.generalOrderId());
        r.assetInstance = row.assetInstanceId() == null ? null : orm.find(AssetInstance.class, row.assetInstanceId());
        r.eventOccurrence = r.generalOrder.eventOccurrence; r.returnedFor = actor; r.submittedBy = actor; r.quantity = input.quantity(); r.notes = input.notes();
        r.expectedReturnLocation = r.item.returnLocation == null ? r.item.storageLocation : r.item.returnLocation;
        r.memberCommandId = input.commandId();
        orm.persist(r); events.record("return.submitted", "return_submission", r.id, actor.id, null, Map.of("itemId", r.item.id.toString(), "quantity", r.quantity)); return r.id;
    }
    private RequestView view(MemberRequest r) { return new RequestView(r.id, r.item.id, r.item.name, r.requester.name, r.kind, r.quantity, r.notes, r.status, r.response, r.createdAt, r.revision, r.asset == null ? null : r.asset.id, r.location == null ? null : r.location.id); }
    private void writable() { if (actors.current().role == DomainEnums.UserRole.read_only) throw ApiException.forbidden("Read-only access"); }
    private boolean staff() { return Set.of(DomainEnums.UserRole.hq_admin, DomainEnums.UserRole.warehouse_crew).contains(actors.current().role); }
}
