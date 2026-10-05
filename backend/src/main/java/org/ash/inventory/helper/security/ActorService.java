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
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/**
 * Resolves the calling account. The identity provider is the only source of roles and faction
 * memberships: accounts are keyed by {@code (issuer, sub)} and role/factions are mirrored from the
 * token's {@code inventory_*} groups on every request. Name and e-mail are display data only.
 */
@RequestScoped
public class ActorService {
    /** Issuer recorded for header-based development accounts. */
    public static final String DEV_ISSUER = "dev";
    static final String FACTION_GROUP_PREFIX = "inventory_faction_";

    @jakarta.inject.Inject InventoryAccess privateAccess;
    private final SecurityIdentity identity;
    private final CurrentVertxRequest request;
    private final UserOrm users;
    private final boolean devAuthEnabled;

    private UserAccount cached;
    private int privateMutationDepth;

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
            // Sync replay and response filters can open another transaction in the
            // same request. Reuse only an entity managed by the current context.
            if (users.isManaged(cached)) return cached;
            var managed = users.find(cached.id);
            if (managed != null) {
                cached = managed;
                return cached;
            }
        }
        String issuer;
        String subject;
        String name;
        String email;
        DomainEnums.UserRole role;
        Set<String> factions;

        if (identity != null && !identity.isAnonymous() && identity.getPrincipal() instanceof JsonWebToken token) {
            issuer = token.getIssuer();
            subject = token.getSubject();
            if (issuer == null || issuer.isBlank() || subject == null || subject.isBlank())
                throw new ApiException(401, "Token has no issuer or subject");
            name = firstClaim(token, subject, "name", "preferred_username");
            email = firstClaim(token, null, "email");
            role = roleFrom(identity.getRoles());
            factions = factionsFrom(identity.getRoles());
        } else if (identity != null && !identity.isAnonymous()) {
            throw new ApiException(401, "Unsupported identity");
        } else if (devAuthEnabled) {
            issuer = DEV_ISSUER;
            subject = header("X-Actor-Id", "dev-hq-admin");
            name = header("X-Actor-Name", "Development HQ Admin");
            email = subject.contains("@") ? subject : "dev@localhost";
            role = parseRole(header("X-Actor-Role", "hq_admin"));
            String factionHeader = header("X-Actor-Factions", null);
            // Development headers stand in for the token; without the header the stored set stays.
            factions = factionHeader == null ? null : parseFactions(factionHeader);
        } else {
            throw new ApiException(401, "Authentication required");
        }
        if (role == null) throw ApiException.forbidden("No inventory role is assigned to this account");

        cached = users.findByIdentity(issuer, subject);
        if (cached == null) {
            cached = new UserAccount();
            cached.issuer = issuer;
            cached.externalSubject = subject;
            cached.name = name;
            cached.email = email;
            cached.role = role;
            cached.factions = factions == null ? new ArrayList<>() : new ArrayList<>(factions);
            users.persist(cached);
        } else {
            if (!Objects.equals(cached.name, name)) cached.name = name;
            if (email != null && !Objects.equals(cached.email, email)) cached.email = email;
            if (cached.role != role) cached.role = role;
            if (factions != null && !new TreeSet<>(cached.factions).equals(factions)) cached.factions = new ArrayList<>(factions);
        }
        return cached;
    }

    /** Marks a private-inventory command; reference lookups inside it require edit rights. */
    public void enterPrivateMutation() { privateMutationDepth++; }
    public void exitPrivateMutation() { privateMutationDepth--; }

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
    /** Private assemblies follow their own policy; public ones are catalog data managed by inventory staff. */
    public void requireAssemblyEdit(org.ash.inventory.model.Assembly assembly) {
        if (assembly == null) throw ApiException.notFound("Assembly not found");
        if (assembly.accessPolicy == null) requireManager();
        else privateAccess.require(assembly.accessPolicy, current(), true);
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
        } else if (value instanceof org.ash.inventory.model.Assembly assembly) {
            if (assembly.accessPolicy != null) privateAccess.require(assembly.accessPolicy, current(), edit);
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

    /** Faction memberships are {@code EVENT:slug} keys; only faction leaders are restricted to them. */
    public boolean canAccessFaction(UserAccount actor, org.ash.inventory.model.Faction faction) {
        if (actor.role != DomainEnums.UserRole.faction_leader) return true;
        return actor.factions.contains(factionKey(faction.eventType, faction.slug));
    }

    public void requireFactionAccess(UserAccount actor, org.ash.inventory.model.Faction faction) {
        if (!canAccessFaction(actor, faction)) {
            throw ApiException.forbidden("You do not have access to this faction");
        }
    }

    public static String factionKey(String eventType, String slug) {
        return eventType.trim().toUpperCase(Locale.ROOT) + ":" + slug.trim().toLowerCase(Locale.ROOT);
    }

    private String header(String name, String fallback) {
        // MCP uses Vert.x routes rather than JAX-RS. Both transports share the
        // same request headers; direct CDI calls have no HTTP request.
        var context = request.getCurrent();
        String value = context == null ? null : context.request().getHeader(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String firstClaim(JsonWebToken token, String fallback, String... names) {
        for (var name : names) {
            Object value = token.getClaim(name);
            if (value != null && !value.toString().isBlank()) return value.toString();
        }
        return fallback;
    }

    /** Most privileged {@code inventory_<role>} group; {@code null} when the account has none. */
    static DomainEnums.UserRole roleFrom(Set<String> roles) {
        if (roles.contains("inventory_hq_admin")) return DomainEnums.UserRole.hq_admin;
        if (roles.contains("inventory_warehouse_crew")) return DomainEnums.UserRole.warehouse_crew;
        if (roles.contains("inventory_marshal")) return DomainEnums.UserRole.marshal;
        if (roles.contains("inventory_event_planner")) return DomainEnums.UserRole.event_planner;
        if (roles.contains("inventory_maintenance_crew")) return DomainEnums.UserRole.maintenance_crew;
        if (roles.contains("inventory_read_only")) return DomainEnums.UserRole.read_only;
        if (roles.contains("inventory_faction_leader")) return DomainEnums.UserRole.faction_leader;
        return null;
    }

    /** Maps {@code inventory_faction_<EVENT>_<slug>} groups to {@code EVENT:slug} membership keys. */
    static Set<String> factionsFrom(Set<String> roles) {
        var result = new TreeSet<String>();
        for (var role : roles) {
            if (!role.startsWith(FACTION_GROUP_PREFIX)) continue;
            String rest = role.substring(FACTION_GROUP_PREFIX.length());
            int separator = rest.indexOf('_');
            if (separator <= 0 || separator == rest.length() - 1) continue;
            result.add(factionKey(rest.substring(0, separator), rest.substring(separator + 1)));
        }
        return result;
    }

    static Set<String> parseFactions(String header) {
        var result = new TreeSet<String>();
        Arrays.stream(header.split(",")).map(String::trim).filter(value -> value.contains(":"))
                .forEach(value -> result.add(factionKey(value.substring(0, value.indexOf(':')), value.substring(value.indexOf(':') + 1))));
        return result;
    }

    private void requireAny(String message, DomainEnums.UserRole... allowed) {
        var role = current().role;
        for (var candidate : allowed) if (role == candidate) return;
        throw ApiException.forbidden(message);
    }

    private static DomainEnums.UserRole parseRole(String value) {
        try { return DomainEnums.UserRole.valueOf(value.trim().toLowerCase(Locale.ROOT)); }
        catch (IllegalArgumentException ignored) { return null; }
    }
}
