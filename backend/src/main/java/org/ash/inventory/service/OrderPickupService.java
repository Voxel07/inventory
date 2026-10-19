package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.Size;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.OrderPickupOrm;
import org.ash.inventory.resource.ApiException;
import java.util.*;

/** Pickup coordination is independent of stock allocation and custody bookkeeping. */
@ApplicationScoped
public class OrderPickupService {
    @Inject OrderPickupOrm orm;
    @Inject ActorService actors;
    @Inject DomainEventService events;

    public record Input(@Size(max = 2000) Map<String, PickupAssignment> assignments) {}
    public record ResponsibilityInput(UUID responsiblePersonId) {}
    public record Responsibility(UUID responsiblePersonId, String responsiblePersonName) {}
    public record Line(UUID itemId, String name, int ordered, int prepared) {}
    public record Group(String key, String name, UUID responsiblePersonId, String responsiblePersonName,
                        UUID pickupLocationId, String pickupLocationName, List<Line> items) {}
    public record Plan(String orderName, String status, boolean canEdit, boolean pickupPointsComplete, List<Group> groups) {}

    private record OrderData(InventoryOrder entity, UUID id, String name, String status, UserAccount creator,
                             Map<String, PickupAssignment> assignments, StorageLocation defaultPickup,
                             List<Item> items, Map<UUID, Integer> ordered, Map<UUID, Integer> prepared) {}

    @Transactional
    public Responsibility responsibility(UUID itemId) {
        var item = orm.require(Item.class, itemId, "Item"); actors.requireItemAccess(item);
        return person(item.responsiblePerson);
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public Responsibility setResponsibility(UUID itemId, ResponsibilityInput input) {
        var item = orm.requireLocked(Item.class, itemId, "Item"); actors.requireItemEdit(item);
        var recipient = input.responsiblePersonId() == null ? null : orm.require(UserAccount.class, input.responsiblePersonId(), "Responsible person");
        if (recipient != null && !actors.canViewItem(item, recipient)) throw ApiException.badRequest("Responsible person needs access to this item");
        item.responsiblePerson = recipient;
        events.record("item.responsibility_changed", "item", item.id, actors.current().id, null, Map.of());
        return person(item.responsiblePerson);
    }

    private Responsibility person(UserAccount user) {
        return new Responsibility(user == null ? null : user.id, user == null ? null : user.name);
    }

    @Transactional
    public Plan get(String kind, UUID id) {
        var data = load(kind, id, false); var actor = actors.current();
        var groups = groups(data);
        if (!canViewAll(data, actor)) {
            groups = groups.stream().filter(g -> actor.id.equals(g.responsiblePersonId())).toList();
            if (groups.isEmpty()) throw ApiException.forbidden("Order belongs to another user or faction");
        }
        return new Plan(data.name, data.status, canEdit(data, actor), completePickupPoints(data), groups);
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public Plan save(String kind, UUID id, Input input) {
        var data = load(kind, id, true); requireEdit(data);
        var safe = new LinkedHashMap<String, PickupAssignment>();
        // Editing the visible part of a mixed order must preserve hidden item assignments.
        for (var item : data.items) if (!actors.canViewItem(item, actors.current()) && data.assignments.containsKey(item.id.toString()))
            safe.put(item.id.toString(), data.assignments.get(item.id.toString()));
        if (input.assignments() == null) throw ApiException.badRequest("Enter pickup assignments");
        for (var entry : input.assignments().entrySet()) {
            var item = data.items.stream().filter(i -> i.id.toString().equals(entry.getKey())).findFirst()
                    .orElseThrow(() -> ApiException.badRequest("Pickup assignment must reference an ordered item"));
            actors.requireItemAccess(item);
            var a = entry.getValue();
            if (a == null) throw ApiException.badRequest("Pickup assignment cannot be null");
            if (a.responsiblePersonId() != null) {
                var recipient = orm.require(UserAccount.class, a.responsiblePersonId(), "Responsible person");
                if (!actors.canViewItem(item, recipient)) throw ApiException.badRequest("Responsible person needs access to this item");
            }
            if (a.pickupLocationId() != null) {
                var location = orm.require(StorageLocation.class, a.pickupLocationId(), "Pickup location");
                actors.requireLocationAccess(location, false);
                if (!location.active) throw ApiException.badRequest("Pickup location must be active");
                // Handed-out assets are booked into the pickup location.
                LocationHierarchyService.requireStockLocation(location);
            }
            var name = a.groupName() == null || a.groupName().isBlank() ? item.category : a.groupName().trim();
            if (name.length() > 160) throw ApiException.badRequest("Pickup group name must be at most 160 characters");
            safe.put(entry.getKey(), new PickupAssignment(a.responsiblePersonId(), name, a.pickupLocationId()));
        }
        data.entity.pickupAssignments = safe;
        // Later changes only show on the order page; the manual notify action re-sends on request.
        events.record("order.pickup_groups_changed", kind + "_order", id, actors.current().id, null, Map.of());
        return get(kind, id);
    }

    @Transactional
    public int notify(String kind, UUID id) {
        var data = load(kind, id, true); requireEdit(data);
        int count = send(kind, id, "order_items_assigned", false);
        events.record("order.responsible_people_notified", kind + "_order", id, actors.current().id, null, Map.of("recipients", count));
        return count;
    }

    /**
     * Called inside the order transaction after submission/ready. Each person gets each notice type once per
     * order, so idempotent retries, reopened preparation and repeated readiness do not send it again.
     */
    public int notifyResponsible(String kind, UUID id, String type) { return send(kind, id, type, true); }

    private int send(String kind, UUID id, String type, boolean once) {
        var data = load(kind, id, false);
        var byPerson = new LinkedHashMap<UUID, List<Group>>();
        for (var group : groups(data)) if (group.responsiblePersonId != null)
            byPerson.computeIfAbsent(group.responsiblePersonId, ignored -> new ArrayList<>()).add(group);
        int count = 0;
        for (var entry : byPerson.entrySet()) {
            if (type.equals("order_group_ready") && entry.getKey().equals(data.creator.id)) continue;
            var recipient = orm.require(UserAccount.class, entry.getKey(), "Responsible person");
            var visible = entry.getValue().stream().map(g -> new Group(g.key, g.name, g.responsiblePersonId, g.responsiblePersonName,
                    g.pickupLocationId, g.pickupLocationName, g.items.stream().filter(l -> data.items.stream()
                            .anyMatch(i -> i.id.equals(l.itemId) && actors.canViewItem(i, recipient))).toList()))
                    .filter(g -> !g.items.isEmpty()).toList();
            var path = path(kind, id);
            if (visible.isEmpty() || once && orm.notified(recipient, type, path)) continue;
            var n = new Notification(); n.recipient = recipient; n.type = type;
            n.payload.put("orderCode", data.name);
            n.payload.put("path", path);
            // Read item details and pickup locations from the scoped live plan. Do not leave
            // private names/locations in a notice after a recipient's access is revoked.
            n.payload.put("groupCount", visible.size());
            orm.persist(n); count++;
        }
        return count;
    }

    public void notifyCreatorReady(String kind, UUID id) {
        var data = load(kind, id, false);
        if (alreadyNotified(data.creator, "order_ready", kind, id)) return;
        var n = new Notification(); n.recipient = data.creator; n.type = "order_ready";
        n.payload.put("orderCode", data.name);
        n.payload.put("path", path(kind, id));
        orm.persist(n);
    }

    public boolean alreadyNotified(UserAccount recipient, String type, String kind, UUID id) {
        return orm.notified(recipient, type, path(kind, id));
    }

    public static String path(String kind, UUID id) { return "/orders?pickupOrder=" + id + "&pickupKind=" + kind; }

    private List<Group> groups(OrderData data) {
        var grouped = new LinkedHashMap<String, List<Line>>(); var details = new LinkedHashMap<String, Group>();
        for (var item : data.items) {
            if (!actors.canViewItem(item, actors.current())) continue;
            actors.requireItemAccess(item);
            var a = data.assignments.get(item.id.toString());
            var user = a == null ? item.responsiblePerson : a.responsiblePersonId() == null ? null : orm.find(UserAccount.class, a.responsiblePersonId());
            var name = a == null ? item.category : a.groupName();
            var location = a == null ? data.defaultPickup : a.pickupLocationId() == null ? null : orm.pickupLocation(a.pickupLocationId());
            if (location != null && !actors.canViewLocation(location)) location = null;
            var key = (user == null ? "unassigned" : user.id) + ":" + name + ":" + (location == null ? "" : location.id);
            grouped.computeIfAbsent(key, ignored -> new ArrayList<>()).add(new Line(item.id, item.name, data.ordered.getOrDefault(item.id, 0), data.prepared.getOrDefault(item.id, 0)));
            details.put(key, new Group(key, name, user == null ? null : user.id, user == null ? null : user.name,
                    location == null ? null : location.id, location == null ? null : location.name, List.of()));
        }
        return details.values().stream().map(g -> new Group(g.key, g.name, g.responsiblePersonId, g.responsiblePersonName,
                g.pickupLocationId, g.pickupLocationName, grouped.get(g.key).stream().sorted(Comparator.comparing(Line::name)).toList()))
                .sorted(Comparator.comparing((Group g) -> g.responsiblePersonName == null ? "\uffff" : g.responsiblePersonName).thenComparing(Group::name)).toList();
    }

    public boolean hasPickupPoints(String kind, UUID id) { return completePickupPoints(load(kind, id, false)); }
    private boolean completePickupPoints(OrderData data) {
        return !data.items.isEmpty() && data.items.stream().allMatch(i -> {
            var a = data.assignments.get(i.id.toString());
            if (a == null || a.pickupLocationId() == null) return false;
            var location = orm.pickupLocation(a.pickupLocationId());
            return location != null && location.active && actors.canViewLocation(location);
        });
    }

    private OrderData load(String kind, UUID id, boolean lock) {
        if (!List.of("faction", "general").contains(kind)) throw ApiException.badRequest("Unknown order kind");
        var o = lock ? orm.requireLocked(InventoryOrder.class, id, "Order") : orm.require(InventoryOrder.class, id, "Order");
        if (!o.kind.name().equals(kind)) throw ApiException.notFound("Order not found");
        var lines = orm.lines(o);
        var requested = new LinkedHashMap<UUID, Integer>(); var prepared = new LinkedHashMap<UUID, Integer>();
        lines.forEach(l -> { requested.merge(l.item.id, l.requestedQuantity, Integer::sum); prepared.merge(l.item.id, l.preparedQuantity, Integer::sum); });
        return new OrderData(o, id, o.label(), o.status.name(), o.createdBy, o.pickupAssignments, o.pickupLocation,
                lines.stream().map(l -> l.item).distinct().toList(), requested, prepared);
    }

    private boolean canViewAll(OrderData data, UserAccount actor) {
        return actors.canViewFaction(actor);
    }
    /** The creator, while still allowed to order that kind of order, or a warehouse worker. */
    private boolean canEdit(OrderData data, UserAccount actor) {
        if (!List.of("draft", "submitted", "preparing", "ready").contains(data.status)) return false;
        if (actor.role.atLeast(DomainEnums.UserRole.warehouse_crew)) return true;
        if (!data.creator.id.equals(actor.id)) return false;
        if (data.entity.kind == InventoryOrder.Kind.faction) return actors.canWriteFaction(actor, data.entity.faction);
        return actor.role.atLeast(DomainEnums.UserRole.ash);
    }
    private void requireEdit(OrderData data) {
        if (!canEdit(data, actors.current())) throw ApiException.forbidden("Only the order owner or an order manager may coordinate active orders");
    }
}
