package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import org.ash.inventory.helper.security.*;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.InventoryAccessOrm;
import org.ash.inventory.resource.ApiException;
import java.util.*;

@ApplicationScoped @Transactional
public class InventoryAccessService {
    @Inject InventoryAccessOrm orm;
    @Inject ActorService actors;
    @Inject InventoryAccess access;
    @Inject DomainEventService events;
    @Inject InventoryOperationsService inventory;
    @Inject CatalogService catalog;
    public record Grant(UUID userId, UUID groupId, boolean canEdit) {}
    /** {@code publicUse}: items only, null keeps the current offer. */
    public record Input(@NotNull Long revision, @NotNull List<Grant> grants, UUID ownerId,
                        @NotBlank @Size(max=1000) String reason, Boolean publicUse) {}
    /**
     * {@code inherited}: shares that reach this resource through the private locations it is stored in;
     * listed for managers only, like {@code grants}.
     */
    public record View(boolean privateResource, UUID ownerId, String ownerName, long revision,
                       boolean canEdit, boolean canManage, boolean publicUse, List<Grant> grants,
                       List<Inherited> inherited, List<Source> sources) {}
    /** kind: owner, admin, person, group, location (inherited) or public_use. */
    public record Source(String kind, UUID principalId, String name, boolean canEdit) {}
    /** kind: owner (of the location), person or group. */
    public record Inherited(UUID locationId, String locationName, String kind, UUID principalId, String name, boolean canEdit) {}
    public record Person(UUID id, String name) {}
    /** {@code ownerId} null: managed by the inventory admin. Members are listed for managers only. */
    public record Group(UUID id, String name, long revision, List<UUID> memberIds, UUID ownerId, String ownerName, boolean canManage) {}
    /** {@code adminManaged}: admin only, creates a shared admin group without a personal owner. */
    public record GroupInput(@NotBlank @Size(max=255) String name, @NotNull @Size(max=200) List<UUID> memberIds,
                             @NotNull Long revision, @NotBlank @Size(max=1000) String reason, Boolean adminManaged) {}
    public record GroupDeletion(@NotNull Long revision, @NotBlank @Size(max=1000) String reason) {}

    public InventoryAccessPolicy create() {
        var policy = new InventoryAccessPolicy(); policy.owner = actors.current(); orm.persist(policy); return policy;
    }
    /** Removes the policy of a hard-deleted resource together with its shares and inheritance links. */
    public void delete(InventoryAccessPolicy policy) {
        if (policy == null) return;
        orm.deleteLinks(policy); orm.deleteGrants(policy); orm.remove(policy);
    }
    public View view(InventoryAccessPolicy policy) {
        if (policy == null) return publicView();
        var result = views(List.of(policy.id)).get(policy.id);
        if (result == null) throw ApiException.notFound("Resource not found");
        return result;
    }
    private View publicView() { return new View(false, null, null, 0, false, false, false, List.of(), List.of(), List.of()); }
    /** Mirrors {@link InventoryAccess#allows} and {@link InventoryAccessOrm#visible} for a batch of policies. */
    public Map<UUID, View> views(Collection<UUID> ids) {
        var actor = actors.current();
        var byPolicy = groupRows(orm.grantViews(ids, actor.id));
        var inheritedGrants = groupRows(orm.inheritedGrantViews(ids, actor.id));
        var inheritedOwners = groupRows(orm.inheritedOwnerViews(ids));
        var result = new HashMap<UUID, View>();
        for (var row : orm.policyViews(ids)) {
            UUID id = (UUID) row[0], owner = (UUID) row[1];
            boolean publicUse = (Boolean) row[4];
            boolean manage = owner.equals(actor.id) || actor.role == DomainEnums.UserRole.admin;
            boolean edit = manage, visible = manage;
            var sources = new ArrayList<Source>(); var grants = new ArrayList<Grant>(); var inherited = new ArrayList<Inherited>();
            if (owner.equals(actor.id)) sources.add(new Source("owner", actor.id, actor.name, true));
            if (actor.role == DomainEnums.UserRole.admin) sources.add(new Source("admin", actor.id, actor.name, true));
            for (var g : byPolicy.getOrDefault(id, List.of())) {
                boolean canEdit = (Boolean) g[4];
                grants.add(new Grant((UUID) g[1], (UUID) g[2], canEdit));
                if (actor.id.equals(g[1])) { sources.add(new Source("person", actor.id, actor.name, canEdit)); visible = true; edit |= canEdit; }
                if (g[2] != null && (Boolean) g[5]) { sources.add(new Source("group", (UUID) g[2], (String) g[3], canEdit)); visible = true; edit |= canEdit; }
            }
            // Shares of the private locations this resource is stored in apply here as well.
            for (var g : inheritedGrants.getOrDefault(id, List.of())) {
                UUID location = (UUID) g[1]; String locationName = (String) g[2];
                UUID user = (UUID) g[3]; UUID group = (UUID) g[5]; boolean canEdit = (Boolean) g[7];
                inherited.add(new Inherited(location, locationName, user != null ? "person" : "group",
                        user != null ? user : group, user != null ? (String) g[4] : (String) g[6], canEdit));
                if (actor.id.equals(user) || group != null && (Boolean) g[8]) {
                    sources.add(new Source("location", location, locationName, canEdit)); visible = true; edit |= canEdit;
                }
            }
            for (var o : inheritedOwners.getOrDefault(id, List.of())) {
                UUID location = (UUID) o[1]; String locationName = (String) o[2]; UUID locationOwner = (UUID) o[3];
                inherited.add(new Inherited(location, locationName, "owner", locationOwner, (String) o[4], true));
                if (actor.id.equals(locationOwner)) { sources.add(new Source("location", location, locationName, true)); visible = true; edit = true; }
            }
            if (publicUse && !visible && ActorService.seesOrganization(actor)) {
                sources.add(new Source("public_use", owner, (String) row[2], false)); visible = true;
            }
            if (visible) result.put(id, new View(true, owner, (String) row[2], ((Number) row[3]).longValue(), edit, manage, publicUse,
                    manage ? List.copyOf(grants) : List.of(), manage ? List.copyOf(inherited) : List.of(), List.copyOf(sources)));
        }
        return result;
    }
    private static Map<UUID, List<Object[]>> groupRows(List<Object[]> rows) {
        var result = new HashMap<UUID, List<Object[]>>();
        rows.forEach(row -> result.computeIfAbsent((UUID) row[0], ignored -> new ArrayList<>()).add(row));
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
        if (policy == null) return ActorService.seesOrganization(actors.current());
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
        if (!access.manages(policy, actors.current())) throw ApiException.forbidden("Only the owner or the inventory admin can manage sharing");
        if (policy.revision != input.revision()) throw ApiException.conflict("Access changed; reload before saving");
        var before = view(policy);
        // Load the item before changing the policy: its access check refreshes the policy and would discard pending changes.
        var item = kind.equals("items") ? orm.findLocked(Item.class, id) : null;
        // Transfer requires explicit administrator review of stock/custody obligations.
        if (input.ownerId() != null && !input.ownerId().equals(policy.owner.id)) {
            actors.requireAdmin();
            if (item != null) {
                var stock = inventory.physicalStock(item);
                if (stock.checkedOut() > 0 || stock.reserved() > 0 || stock.inTransit() > 0 || orm.currentCommitments(item))
                    throw ApiException.conflict("Resolve custody, reservations, transfers and commitments before transferring ownership");
            } else if (kind.equals("storage-locations") && orm.locationOccupied(orm.findLocked(StorageLocation.class, id)))
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
            else {
                value.group = orm.findLocked(InventoryAccessGroup.class, g.groupId());
                // Other users' private groups stay unknown; only shareable groups may be used.
                if (value.group == null || !canUse(value.group, actors.current())) throw ApiException.badRequest("Group not found");
            }
            values.add(value);
        }
        if (input.publicUse() != null && input.publicUse() != policy.publicUse) {
            if (item == null) throw ApiException.badRequest("Only items can be offered for use");
            policy.publicUse = input.publicUse();
            // Offered items are requested through owner commitments, never handed out freely.
            if (policy.publicUse && item.availabilityPolicy != Item.AvailabilityPolicy.commitment_required) {
                item.availabilityPolicy = Item.AvailabilityPolicy.commitment_required;
                item.equipmentRevision++;
            }
        }
        orm.deleteGrants(policy); values.forEach(orm::persist); policy.revision++; orm.flush();
        var after = view(policy);
        events.record("access.changed", kind, id, actors.current().id, null, Map.of("before", before, "after", after, "reason", input.reason()));
        return after;
    }
    public List<Person> people() { actors.current(); return orm.people().stream().map(u -> new Person(u.id, u.name)).toList(); }
    /**
     * The inventory admin sees every group. Others see the groups they own (with members), groups they
     * belong to and admin-managed groups; other users' private groups stay hidden.
     */
    public List<Group> groups() {
        var actor = actors.current();
        return orm.groups().stream().filter(g -> canUse(g, actor)).map(g -> group(g, actor)).toList();
    }
    /** Any user may create share groups (e.g. a tenant for the people allowed into their building). */
    public Group saveGroup(UUID id, GroupInput input) {
        var actor = actors.current();
        boolean admin = actor.role == DomainEnums.UserRole.admin;
        if (Boolean.TRUE.equals(input.adminManaged()) && !admin) throw ApiException.forbidden("Only the inventory admin manages admin groups");
        if (id != null) orm.lockGroupPolicies(id);
        var g = id == null ? new InventoryAccessGroup() : orm.findLocked(InventoryAccessGroup.class, id);
        if (g == null || id != null && !canUse(g, actor)) throw ApiException.notFound("Group not found");
        if (id != null && !canManage(g, actor)) throw ApiException.forbidden("Only the group owner or the inventory admin can change this group");
        if (id == null) g.owner = Boolean.TRUE.equals(input.adminManaged()) ? null : actor;
        if (g.revision != input.revision()) throw ApiException.conflict("Group changed; reload");
        UUID scope = g.owner == null ? null : g.owner.id;
        if (orm.groups().stream().anyMatch(other -> !Objects.equals(other.id, id) && Objects.equals(other.owner == null ? null : other.owner.id, scope)
                && other.name.equalsIgnoreCase(input.name().trim()))) throw ApiException.conflict("Group name already exists");
        var before = g.members.stream().map(u -> u.id).toList();
        var beforeName = g.name == null ? "" : g.name;
        g.name = input.name().trim(); g.members = new HashSet<>();
        for (var member : input.memberIds()) g.members.add(person(member));
        g.revision++; if (id == null) orm.persist(g); orm.flush();
        events.record("access.changed", "access_group", g.id, actor.id, null,
                Map.of("beforeName", beforeName, "name", g.name, "beforeMembers", before, "members", input.memberIds(), "reason", input.reason()));
        return group(g, actor);
    }
    /** Removes a group and every share made with it. */
    public void deleteGroup(UUID id, GroupDeletion input) {
        var actor = actors.current();
        var policies = orm.lockGroupPolicies(id);
        var g = orm.findLocked(InventoryAccessGroup.class, id);
        if (g == null || !canUse(g, actor)) throw ApiException.notFound("Group not found");
        if (!canManage(g, actor)) throw ApiException.forbidden("Only the group owner or the inventory admin can delete this group");
        if (g.revision != input.revision()) throw ApiException.conflict("Group changed; reload");
        var members = g.members.stream().map(u -> u.id).toList();
        String name = g.name;
        orm.deleteGroupGrants(g);
        policies.forEach(policy -> policy.revision++);
        g.members.clear(); orm.remove(g); orm.flush();
        events.record("access.changed", "access_group", id, actor.id, null,
                Map.of("beforeName", name, "beforeMembers", members, "deleted", true, "reason", input.reason()));
    }
    private static boolean canManage(InventoryAccessGroup g, UserAccount actor) {
        return actor.role == DomainEnums.UserRole.admin || g.owner != null && g.owner.id.equals(actor.id);
    }
    /** Groups an actor may see and share with: own, admin-managed, or one they belong to. */
    private static boolean canUse(InventoryAccessGroup g, UserAccount actor) {
        return canManage(g, actor) || g.owner == null || g.members.stream().anyMatch(u -> u.id.equals(actor.id));
    }
    private static Group group(InventoryAccessGroup g, UserAccount actor) {
        boolean manage = canManage(g, actor);
        return new Group(g.id, g.name, g.revision, manage ? g.members.stream().map(u -> u.id).sorted().toList() : List.of(),
                g.owner == null ? null : g.owner.id, g.owner == null ? null : g.owner.name, manage);
    }
    private Grant grant(InventoryAccessGrant g) { return new Grant(g.user == null ? null : g.user.id, g.group == null ? null : g.group.id, g.canEdit); }
    private UserAccount person(UUID id) { var u = id == null ? null : orm.find(UserAccount.class, id); if (u == null || !u.active) throw ApiException.badRequest("Active person not found"); return u; }
    private InventoryAccessPolicy lockedPolicy(String kind, UUID id) {
        // Commands lock policies before stock/catalog rows; sharing uses the same order.
        var currentPolicy = policy(kind, id);
        if (currentPolicy != null) { orm.lock(currentPolicy); orm.refresh(currentPolicy); }
        return switch (kind) {
            case "items" -> { var i = orm.findLocked(Item.class, id); if (i == null) throw ApiException.notFound("Item not found"); yield i.accessPolicy; }
            case "storage-locations" -> { var l = orm.findLocked(StorageLocation.class, id); if (l == null) throw ApiException.notFound("Location not found"); yield l.accessPolicy; }
            case "assemblies" -> { var a = orm.findLocked(Assembly.class, id); if (a == null) throw ApiException.notFound("Assembly not found"); yield a.accessPolicy; }
            default -> throw ApiException.notFound("Resource not found");
        };
    }
    private InventoryAccessPolicy policy(String kind, UUID id) {
        return switch (kind) {
            case "items" -> { var i = orm.find(Item.class, id); if (i == null) throw ApiException.notFound("Item not found"); actors.requireItemAccess(i); yield i.accessPolicy; }
            case "storage-locations" -> { var l = orm.find(StorageLocation.class, id); if (l == null) throw ApiException.notFound("Location not found"); actors.requireLocationAccess(l, false); yield l.accessPolicy; }
            case "assemblies" -> { var a = orm.find(Assembly.class, id); if (a == null || !catalog.canViewAssembly(a)) throw ApiException.notFound("Assembly not found"); yield a.accessPolicy; }
            default -> throw ApiException.notFound("Resource not found");
        };
    }
}
