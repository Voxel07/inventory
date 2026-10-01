package org.ash.inventory.helper.security;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.transaction.Transactional;
import io.quarkus.vertx.http.runtime.CurrentVertxRequest;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.UserOrm;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.ArrayList;
import java.util.Objects;
import java.util.Set;

@RequestScoped
public class ActorService {
    @jakarta.inject.Inject InventoryAccess privateAccess;
    public int privateMutationDepth;
    private final SecurityIdentity identity;
    private final CurrentVertxRequest request;
    private final UserOrm users;
    private final boolean devAuthEnabled;

    private UserAccount cached;

    public ActorService(SecurityIdentity identity, CurrentVertxRequest request, UserOrm users,
            @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled) {
        this.identity = identity;
        this.request = request;
        this.users = users;
        this.devAuthEnabled = devAuthEnabled;
    }

    @Transactional
    public UserAccount current() {
        if (cached != null) {
            var managed = users.findByExternalSubject(cached.externalSubject);
            if (managed != null) {
                cached = managed;
                return cached;
            }
        }
        String subject;
        String name;
        String email = null;
        DomainEnums.UserRole role;
        Set<String> factions = Set.of();

        if (identity != null && !identity.isAnonymous()) {
            subject = identity.getPrincipal().getName();
            name = stringAttribute("name", subject);
            email = stringAttribute("email", null);
            role = roleFrom(identity.getRoles());
            Object groups = identity.getAttribute("factions");
            if (groups instanceof Set<?> values) factions = values.stream().map(Object::toString).collect(java.util.stream.Collectors.toSet());
        } else if (devAuthEnabled) {
            subject = header("X-Actor-Id", "dev-hq-admin");
            name = header("X-Actor-Name", "Development HQ Admin");
            email = subject.contains("@") ? subject : "dev@localhost";
            role = parseRole(header("X-Actor-Role", "hq_admin"));
        } else {
            throw new ApiException(401, "Authentication required");
        }

        cached = users.findByExternalSubject(subject);
        if (cached == null) {
            cached = new UserAccount();
            cached.externalSubject = subject;
            cached.name = name;
            cached.email = email;
            cached.role = role;
            cached.factions = new ArrayList<>(factions);
            users.persist(cached);
        } else {
            if (!Objects.equals(cached.name, name)) cached.name = name;
            if (email != null && !Objects.equals(cached.email, email)) cached.email = email;
            if ((devAuthEnabled || (identity != null && !identity.isAnonymous())) && cached.role != role) {
                cached.role = role;
            }
            if (identity != null && !identity.isAnonymous()
                    && !Set.copyOf(cached.factions).equals(factions)) {
                cached.factions = new ArrayList<>(factions);
            }
        }
        return cached;
    }

    public void requireManager() {
        requireAny("Inventory management access required", DomainEnums.UserRole.hq_admin,
                DomainEnums.UserRole.warehouse_crew);
    }

    public boolean canViewItem(org.ash.inventory.model.Item item, UserAccount actor) {
        if (item.accessPolicy != null) return privateAccess.allows(item.accessPolicy, actor, false);
        if (actor.role == DomainEnums.UserRole.hq_admin || actor.role == DomainEnums.UserRole.warehouse_crew
                || item.visibilityScope == null || item.visibilityScope == DomainEnums.ItemVisibilityScope.global
                || item.visibilityScope == DomainEnums.ItemVisibilityScope.event) return true;
        if (item.visibilityScope == DomainEnums.ItemVisibilityScope.person)
            return item.assignedUser != null && item.assignedUser.id.equals(actor.id);
        return item.assignedGroup != null && actor.factions.contains(item.assignedGroup);
    }

    public void requireItemAccess(org.ash.inventory.model.Item item) {
        if (item == null || !item.active || !canViewItem(item, current())) throw ApiException.notFound("Item not found");
    }

    public boolean canViewLocation(org.ash.inventory.model.StorageLocation location) {
        return location != null && privateAccess.allows(location.accessPolicy, current(), false);
    }
    public void requireLocationAccess(org.ash.inventory.model.StorageLocation location, boolean edit) {
        if (location == null) throw ApiException.notFound("Location not found");
        privateAccess.require(location.accessPolicy, current(), edit);
    }
    public void requireItemEdit(org.ash.inventory.model.Item item) {
        requireItemAccess(item);
        if (item.accessPolicy == null) requireManager();
        else privateAccess.require(item.accessPolicy, current(), true);
    }
    public void requireLocationEdit(org.ash.inventory.model.StorageLocation location) {
        requireLocationAccess(location, true);
        if (location.accessPolicy == null) requireManager();
    }

    /** Defense at entity lookup for commands addressed by asset, lot, repair, return or location IDs. */
    public <T> T protect(T value, boolean edit) {
        protectReferences(value, edit || privateMutationDepth > 0,
                java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>()));
        return value;
    }

    private void protectReferences(Object value, boolean edit, Set<Object> visited) {
        if (value == null || !(value instanceof org.ash.inventory.model.BaseEntity)) return;
        value = org.hibernate.Hibernate.unproxy(value);
        if (!visited.add(value)) return;
        if (value instanceof org.ash.inventory.model.Item item) {
            if (item.accessPolicy != null) privateAccess.require(item.accessPolicy, current(), edit);
        } else if (value instanceof org.ash.inventory.model.StorageLocation location) {
            if (location.accessPolicy != null) requireLocationAccess(location, edit);
        } else if (!(value instanceof UserAccount)
                && !(value instanceof org.ash.inventory.model.InventoryAccessPolicy)
                && !(value instanceof org.ash.inventory.model.InventoryAccessGroup)
                && !(value instanceof org.ash.inventory.model.InventoryAccessGrant)) {
            // Follow singular resource associations (repair -> damage -> item, loan -> commitment -> item).
            // Collections and user/group graphs are deliberately excluded; collection queries have their own scopes.
            for (var field : value.getClass().getFields()) {
                if (!org.ash.inventory.model.BaseEntity.class.isAssignableFrom(field.getType())) continue;
                try { protectReferences(field.get(value), edit, visited); }
                catch (IllegalAccessException e) { throw new IllegalStateException(e); }
            }
        }
    }

    public void requireAdmin() {
        requireAny("Administrator access required", DomainEnums.UserRole.hq_admin);
    }

    public void requireWarehouse() {
        requireAny("Warehouse access required", DomainEnums.UserRole.hq_admin,
                DomainEnums.UserRole.warehouse_crew);
    }

    public void requireMarshal() {
        requireAny("Marshal access required", DomainEnums.UserRole.hq_admin,
                DomainEnums.UserRole.warehouse_crew, DomainEnums.UserRole.marshal);
    }

    public void requireMaintenance() {
        requireAny("Maintenance access required", DomainEnums.UserRole.hq_admin,
                DomainEnums.UserRole.maintenance_crew);
    }

    public void requirePlanner() {
        requireAny("Event planner access required", DomainEnums.UserRole.hq_admin,
                DomainEnums.UserRole.event_planner);
    }

    public void requireProcurement() {
        requireAny("Procurement access required", DomainEnums.UserRole.hq_admin,
                DomainEnums.UserRole.event_planner, DomainEnums.UserRole.warehouse_crew);
    }

    public boolean canAccessFaction(UserAccount actor, String eventType, String faction) {
        if (actor.role != DomainEnums.UserRole.faction_leader) return true;
        String key = eventType + ":" + faction;
        return actor.factions.contains(faction) || actor.factions.contains(key);
    }

    public void requireFactionAccess(UserAccount actor, String eventType, String faction) {
        if (!canAccessFaction(actor, eventType, faction)) {
            throw ApiException.forbidden("You do not have access to this faction");
        }
    }

    private String header(String name, String fallback) {
        // MCP uses Vert.x routes rather than JAX-RS. Both transports share the
        // same request headers; direct CDI calls have no HTTP request.
        var context = request.getCurrent();
        String value = context == null ? null : context.request().getHeader(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private String stringAttribute(String name, String fallback) {
        Object value = identity.getAttribute(name);
        return value == null ? fallback : value.toString();
    }

    static DomainEnums.UserRole roleFrom(Set<String> roles) {
        if (roles.contains("inventory_hq_admin")) return DomainEnums.UserRole.hq_admin;
        if (roles.contains("inventory_warehouse_crew")) return DomainEnums.UserRole.warehouse_crew;
        if (roles.contains("inventory_marshal")) return DomainEnums.UserRole.marshal;
        if (roles.contains("inventory_event_planner")) return DomainEnums.UserRole.event_planner;
        if (roles.contains("inventory_maintenance_crew")) return DomainEnums.UserRole.maintenance_crew;
        if (roles.contains("inventory_read_only")) return DomainEnums.UserRole.read_only;
        if (roles.contains("inventory_faction_leader")) return DomainEnums.UserRole.faction_leader;
        return DomainEnums.UserRole.faction_leader;
    }

    private void requireAny(String message, DomainEnums.UserRole... allowed) {
        var role = current().role;
        for (var candidate : allowed) if (role == candidate) return;
        throw ApiException.forbidden(message);
    }

    private DomainEnums.UserRole parseRole(String value) {
        try { return DomainEnums.UserRole.valueOf(value.trim().toLowerCase()); }
        catch (IllegalArgumentException ignored) { return DomainEnums.UserRole.faction_leader; }
    }
}
