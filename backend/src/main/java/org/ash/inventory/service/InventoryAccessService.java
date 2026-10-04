package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import org.ash.inventory.helper.security.*;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.InventoryAccessOrm;
import org.ash.inventory.resource.ApiException;
import java.time.Instant;
import java.util.*;

@ApplicationScoped @Transactional
public class InventoryAccessService {
    @Inject InventoryAccessOrm orm;
    @Inject ActorService actors;
    @Inject InventoryAccess access;
    @Inject DomainEventService events;
    @Inject InventoryOperationsService inventory;
    public record Grant(UUID userId, UUID groupId, boolean canEdit) {}
    public record Input(@NotNull Long revision, @NotNull List<Grant> grants, UUID ownerId,
                        @NotBlank @Size(max=1000) String reason) {}
    public record View(boolean privateResource, UUID ownerId, String ownerName, long revision,
                       boolean canEdit, boolean canManage, List<Grant> grants, List<Source> sources) {}
    public record Source(String kind, UUID principalId, String name, boolean canEdit) {}
    public record Person(UUID id, String name) {}
    public record Group(UUID id, String name, long revision, List<UUID> memberIds) {}
    public record GroupInput(@NotBlank @Size(max=255) String name, @NotNull List<UUID> memberIds,
                             @NotNull Long revision, @NotBlank @Size(max=1000) String reason) {}

    public InventoryAccessPolicy create() {
        var policy = new InventoryAccessPolicy(); policy.owner = actors.current(); orm.persist(policy); return policy;
    }
    public View view(InventoryAccessPolicy policy) {
        if (policy == null) return publicView();
        var result = views(List.of(policy.id)).get(policy.id);
        if (result == null) throw ApiException.notFound("Resource not found");
        return result;
    }
    private View publicView() { return new View(false, null, null, 0, false, false, List.of(), List.of()); }
    public Map<UUID, View> views(Collection<UUID> ids) {
        var actor = actors.current();
        var grantRows = orm.grantViews(ids, actor.id);
        var byPolicy = new HashMap<UUID, List<Object[]>>();
        grantRows.forEach(row -> byPolicy.computeIfAbsent((UUID) row[0], ignored -> new ArrayList<>()).add(row));
        var result = new HashMap<UUID, View>();
        for (var row : orm.policyViews(ids)) {
            UUID id = (UUID) row[0], owner = (UUID) row[1];
            boolean manage = owner.equals(actor.id) || actor.role == DomainEnums.UserRole.hq_admin;
            boolean edit = manage, visible = manage;
            var sources = new ArrayList<Source>(); var grants = new ArrayList<Grant>();
            if (owner.equals(actor.id)) sources.add(new Source("owner", actor.id, actor.name, true));
            if (actor.role == DomainEnums.UserRole.hq_admin) sources.add(new Source("admin", actor.id, actor.name, true));
            for (var g : byPolicy.getOrDefault(id, List.of())) {
                boolean canEdit = (Boolean) g[4];
                grants.add(new Grant((UUID) g[1], (UUID) g[2], canEdit));
                if (actor.id.equals(g[1])) { sources.add(new Source("person", actor.id, actor.name, canEdit)); visible = true; edit |= canEdit; }
                if (g[2] != null && (Boolean) g[5]) { sources.add(new Source("group", (UUID) g[2], (String) g[3], canEdit)); visible = true; edit |= canEdit; }
            }
            if (visible) result.put(id, new View(true, owner, (String) row[2], ((Number) row[3]).longValue(), edit, manage,
                    manage ? List.copyOf(grants) : List.of(), List.copyOf(sources)));
        }
        return result;
    }
    @Inject jakarta.transaction.TransactionSynchronizationRegistry transactions;
    private static final Object PROJECTION_KEY = new Object();
    @SuppressWarnings("unchecked")
    private Map<UUID, View> projections() {
        var values = (Map<UUID, View>) transactions.getResource(PROJECTION_KEY);
        if (values == null) { values = new HashMap<>(); transactions.putResource(PROJECTION_KEY, values); }
        return values;
    }
    public void prepare(Collection<InventoryAccessPolicy> policies) {
        var ids = policies.stream().filter(Objects::nonNull).map(p -> p.id).distinct().toList();
        if (ids.isEmpty()) return;
        var loaded = views(ids); var values = projections();
        ids.forEach(id -> values.put(id, loaded.get(id)));
    }
    public void prepareItems(List<Item> items) {
        var policies = new ArrayList<org.ash.inventory.model.InventoryAccessPolicy>();
        var locations = new ArrayList<StorageLocation>();
        for (var item : items) { policies.add(item.accessPolicy); locations.add(item.storageLocation); locations.add(item.returnLocation); }
        prepareLocations(locations, policies);
    }
    public void prepareLocations(java.util.Collection<StorageLocation> locations) { prepareLocations(locations, new ArrayList<>()); }
    private void prepareLocations(java.util.Collection<StorageLocation> locations, List<org.ash.inventory.model.InventoryAccessPolicy> policies) {
        var ids = locations.stream().filter(java.util.Objects::nonNull).map(l -> l.id).distinct().toList();
        // Also materialize the parent policy used by location DTOs in a bounded batch.
        var loaded = orm.projectionLocations(ids);
        var parents = loaded.stream().filter(l -> l.parent != null).map(l -> l.parent.id).distinct().toList();
        for (var location : loaded) policies.add(location.accessPolicy);
        for (var parent : orm.projectionLocations(parents)) policies.add(parent.accessPolicy);
        prepare(policies);
    }
    public boolean projectionAllows(InventoryAccessPolicy policy) {
        if (policy == null) return true;
        var values = projections();
        if (!values.containsKey(policy.id)) prepare(List.of(policy));
        return values.get(policy.id) != null;
    }
    public View projection(InventoryAccessPolicy policy) {
        if (policy == null) return publicView();
        if (!projectionAllows(policy)) throw ApiException.notFound("Resource not found");
        return projections().get(policy.id);
    }
    public View get(String kind, UUID id) { return view(policy(kind, id)); }
    public View update(String kind, UUID id, Input input) {
        var policy = lockedPolicy(kind, id);
        if (policy == null) throw ApiException.badRequest("Create a private resource before managing shares");
        orm.lock(policy); orm.refresh(policy);
        if (!access.manages(policy, actors.current())) throw ApiException.forbidden("Only the owner or HQ admin can manage sharing");
        if (policy.revision != input.revision()) throw ApiException.conflict("Access changed; reload before saving");
        var before = view(policy);
        // Transfer requires explicit administrator review of stock/custody obligations.
        if (input.ownerId() != null && !input.ownerId().equals(policy.owner.id)) {
            actors.requireAdmin();
            if (kind.equals("items")) {
                var item = orm.findLocked(Item.class, id); var stock = inventory.physicalStock(item);
                if (stock.checkedOut() > 0 || stock.reserved() > 0 || stock.inTransit() > 0 || orm.currentCommitments(item))
                    throw ApiException.conflict("Resolve custody, reservations, transfers and commitments before transferring ownership");
            } else if (orm.locationOccupied(orm.findLocked(StorageLocation.class, id)))
                throw ApiException.conflict("Empty the location before transferring ownership");
            policy.owner = person(input.ownerId());
        }
        var seen = new HashSet<String>(); var values = new ArrayList<InventoryAccessGrant>();
        if (input.grants().size() > 200) throw ApiException.badRequest("Too many shares");
        for (var g : input.grants()) {
            if (g == null || (g.userId() == null) == (g.groupId() == null)) throw ApiException.badRequest("Select exactly one person or group per share");
            String key = g.userId() == null ? "group:" + g.groupId() : "user:" + g.userId();
            if (!seen.add(key)) throw ApiException.badRequest("Duplicate share");
            var value = new InventoryAccessGrant(); value.policy = policy; value.canEdit = g.canEdit();
            if (g.userId() != null) value.user = person(g.userId());
            else { value.group = orm.findLocked(InventoryAccessGroup.class, g.groupId()); if (value.group == null) throw ApiException.badRequest("Group not found"); }
            values.add(value);
        }
        orm.deleteGrants(policy); values.forEach(orm::persist); policy.revision++; orm.flush();
        var after = view(policy);
        events.record("access.changed", kind, id, actors.current().id, null, Map.of("before", before, "after", after, "reason", input.reason()));
        return after;
    }
    public List<Person> people() { actors.current(); return orm.people().stream().map(u -> new Person(u.id, u.name)).toList(); }
    public List<Group> groups() {
        var actor = actors.current(); boolean admin = actor.role == DomainEnums.UserRole.hq_admin;
        return orm.groups().stream().map(g -> new Group(g.id, g.name, g.revision,
                admin ? g.members.stream().map(u -> u.id).sorted().toList() : List.of())).toList();
    }
    public Group saveGroup(UUID id, GroupInput input) {
        actors.requireAdmin();
        if (id != null) orm.lockGroupPolicies(id);
        var g = id == null ? new InventoryAccessGroup() : orm.findLocked(InventoryAccessGroup.class, id);
        if (g == null) throw ApiException.notFound("Group not found");
        if (g.revision != input.revision()) throw ApiException.conflict("Group changed; reload");
        if (orm.groups().stream().anyMatch(other -> !Objects.equals(other.id, id) && other.name.equalsIgnoreCase(input.name().trim()))) throw ApiException.conflict("Group name already exists");
        var before = g.members.stream().map(u -> u.id).toList();
        var beforeName = g.name == null ? "" : g.name;
        g.name = input.name().trim(); g.members = new HashSet<>();
        for (var member : input.memberIds()) g.members.add(person(member));
        g.revision++; if (id == null) orm.persist(g); orm.flush();
        events.record("access.changed", "access_group", g.id, actors.current().id, null,
                Map.of("beforeName", beforeName, "name", g.name, "beforeMembers", before, "members", input.memberIds(), "reason", input.reason()));
        return new Group(g.id, g.name, g.revision, g.members.stream().map(u -> u.id).toList());
    }
    private Grant grant(InventoryAccessGrant g) { return new Grant(g.user == null ? null : g.user.id, g.group == null ? null : g.group.id, g.canEdit); }
    private UserAccount person(UUID id) { var u = id == null ? null : orm.find(UserAccount.class, id); if (u == null) throw ApiException.badRequest("Person not found"); return u; }
    private InventoryAccessPolicy lockedPolicy(String kind, UUID id) {
        // Commands lock policies before stock/catalog rows; sharing uses the same order.
        var currentPolicy = policy(kind, id);
        if (currentPolicy != null) { orm.lock(currentPolicy); orm.refresh(currentPolicy); }
        return switch (kind) {
            case "items" -> { var i = orm.findLocked(Item.class, id); if (i == null) throw ApiException.notFound("Item not found"); yield i.accessPolicy; }
            case "storage-locations" -> { var l = orm.findLocked(StorageLocation.class, id); if (l == null) throw ApiException.notFound("Location not found"); yield l.accessPolicy; }
            default -> throw ApiException.notFound("Resource not found");
        };
    }
    private InventoryAccessPolicy policy(String kind, UUID id) {
        return switch (kind) {
            case "items" -> { var i = orm.find(Item.class, id); if (i == null) throw ApiException.notFound("Item not found"); actors.requireItemAccess(i); yield i.accessPolicy; }
            case "storage-locations" -> { var l = orm.find(StorageLocation.class, id); if (l == null) throw ApiException.notFound("Location not found"); actors.requireLocationAccess(l, false); yield l.accessPolicy; }
            default -> throw ApiException.notFound("Resource not found");
        };
    }
}
