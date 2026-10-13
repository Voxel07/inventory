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
 * Resolves the calling account. The identity provider decides who may use the inventory at all
 * (membership in the access group, default {@code inventory}); the role and faction memberships are
 * managed in the app by the inventory admin. Accounts are keyed by {@code (issuer, sub)}; new accounts
 * start as {@code read_only} unless listed as bootstrap admins. Name and e-mail are display data only.
 */
@RequestScoped
public class ActorService {
    /** Issuer recorded for header-based development accounts. */
    public static final String DEV_ISSUER = "dev";

    @jakarta.inject.Inject InventoryAccess privateAccess;
    private final SecurityIdentity identity;
    private final CurrentVertxRequest request;
    private final UserOrm users;
    private final boolean devAuthEnabled;
    private final String accessGroup;
    private final Set<String> bootstrapAdmins;

    private UserAccount cached;
    private int privateMutationDepth;
    private int usageDepth;

    public ActorService(SecurityIdentity identity, CurrentVertxRequest request, UserOrm users,
            @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled,
            @ConfigProperty(name = "inventory.auth.access-group", defaultValue = "inventory") String accessGroup,
            @ConfigProperty(name = "inventory.auth.bootstrap-admins") java.util.Optional<String> bootstrapAdmins) {
        this.identity = identity;
        this.request = request;
        this.users = users;
        this.devAuthEnabled = devAuthEnabled;
        this.accessGroup = accessGroup.trim();
        this.bootstrapAdmins = parseBootstrapAdmins(bootstrapAdmins.orElse(""));
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
        String username = null;
        // Only development headers set role/factions; real accounts keep the ones managed in the app.
        Set<DomainEnums.UserRole> headerRoles = null;
        Set<String> headerFactions = null;

        if (identity != null && !identity.isAnonymous() && identity.getPrincipal() instanceof JsonWebToken token) {
            issuer = token.getIssuer();
            subject = token.getSubject();
            if (issuer == null || issuer.isBlank() || subject == null || subject.isBlank())
                throw new ApiException(401, "Token has no issuer or subject");
            if (!hasAccess(identity.getRoles(), accessGroup))
                throw ApiException.forbidden("This account has no access to the inventory system");
            name = firstClaim(token, subject, "name", "preferred_username");
            email = firstClaim(token, null, "email");
            username = firstClaim(token, null, "preferred_username");
        } else if (identity != null && !identity.isAnonymous()) {
            throw new ApiException(401, "Unsupported identity");
        } else if (devAuthEnabled) {
            issuer = DEV_ISSUER;
            subject = header("X-Actor-Id", "dev-admin");
            name = header("X-Actor-Name", "Development Admin");
            email = subject.contains("@") ? subject : "dev@localhost";
            // Development headers simulate the role stored for the account.
            try { headerRoles = parseRoles(Arrays.asList(header("X-Actor-Role", "admin").split(","))); }
            catch (ApiException invalid) { throw ApiException.forbidden("Unknown inventory role"); }
            String factionHeader = header("X-Actor-Factions", null);
            headerFactions = factionHeader == null ? null : parseFactions(factionHeader);
        } else {
            throw new ApiException(401, "Authentication required");
        }

        cached = users.findByIdentity(issuer, subject);
        boolean bootstrap = isBootstrapAdmin(email, username);
        if (cached == null) {
            cached = new UserAccount();
            cached.issuer = issuer;
            cached.externalSubject = subject;
            cached.name = name;
            cached.email = email;
            cached.setRoles(headerRoles != null ? headerRoles : Set.of(bootstrap ? DomainEnums.UserRole.admin : DomainEnums.UserRole.read_only));
            cached.factions = headerFactions == null ? new ArrayList<>() : new ArrayList<>(headerFactions);
            users.persist(cached);
        } else {
            if (!Objects.equals(cached.name, name)) cached.name = name;
            if (email != null && !Objects.equals(cached.email, email)) cached.email = email;
            if (headerRoles != null && !new TreeSet<>(cached.roles).equals(headerRoles)) cached.setRoles(headerRoles);
            if (headerFactions != null && !new TreeSet<>(cached.factions).equals(headerFactions)) cached.factions = new ArrayList<>(headerFactions);
            // Recovery: a listed bootstrap admin regains admin only while no admin exists.
            if (bootstrap && cached.role != DomainEnums.UserRole.admin && !users.adminExists()) {
                var restored = new TreeSet<>(cached.roles); restored.add(DomainEnums.UserRole.admin); cached.setRoles(restored);
            }
        }
        return cached;
    }

    /** Membership in the access group admits an account to the inventory system. */
    static boolean hasAccess(Set<String> groups, String accessGroup) {
        return !accessGroup.isEmpty() && groups.contains(accessGroup);
    }

    static Set<String> parseBootstrapAdmins(String value) {
        var result = new TreeSet<String>();
        if (value == null) return result;
        Arrays.stream(value.split(",")).map(entry -> entry.trim().toLowerCase(Locale.ROOT)).filter(entry -> !entry.isEmpty()).forEach(result::add);
        return result;
    }

    private boolean isBootstrapAdmin(String email, String username) {
        return email != null && bootstrapAdmins.contains(email.trim().toLowerCase(Locale.ROOT))
                || username != null && bootstrapAdmins.contains(username.trim().toLowerCase(Locale.ROOT));
    }

    /** Marks a private-inventory command; reference lookups inside it require edit rights. */
    public void enterPrivateMutation() { privateMutationDepth++; }
    public void exitPrivateMutation() { privateMutationDepth--; }
    /**
     * Marks a usage command (ordering, takeout, returns, requests). Inside one, items their owner
     * offered for use only need view rights, so others can request them without editing them.
     */
    public void enterUsageCommand() { usageDepth++; }
    public void exitUsageCommand() { usageDepth--; }
    public boolean inUsageCommand() { return usageDepth > 0; }

    /** True when the calling account's role is {@code minimum} or higher on the role ladder. */
    public boolean atLeast(DomainEnums.UserRole minimum) {
        return current().role.atLeast(minimum);
    }

    public void requireAtLeast(DomainEnums.UserRole minimum, String message) {
        if (!atLeast(minimum)) throw ApiException.forbidden(message);
    }

    /** Organization data (public catalog, events, orders) is hidden from tenants. */
    public static boolean seesOrganization(UserAccount actor) {
        return actor.role.atLeast(DomainEnums.UserRole.read_only);
    }

    public boolean canViewItem(org.ash.inventory.model.Item item, UserAccount actor) {
        if (item.accessPolicy != null) return privateAccess.allows(item.accessPolicy, actor, false);
        if (!seesOrganization(actor)) return false;
        if (actor.role.atLeast(DomainEnums.UserRole.warehouse_crew)
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
        privateAccess.require(location.accessPolicy, current(), edit, inUsageCommand());
    }
    public void requireItemEdit(org.ash.inventory.model.Item item) {
        requireItemAccess(item);
        if (item.accessPolicy == null) requireWarehouse();
        else privateAccess.require(item.accessPolicy, current(), true, inUsageCommand());
    }
    /** Private assemblies follow their own policy; public ones are catalog data managed by inventory staff. */
    public void requireAssemblyEdit(org.ash.inventory.model.Assembly assembly) {
        if (assembly == null) throw ApiException.notFound("Assembly not found");
        if (assembly.accessPolicy == null) {
            if (!seesOrganization(current())) throw ApiException.notFound("Assembly not found");
            requireWarehouse();
        } else privateAccess.require(assembly.accessPolicy, current(), true, inUsageCommand());
    }
    public void requireLocationEdit(org.ash.inventory.model.StorageLocation location) {
        requireLocationAccess(location, true);
        if (location.accessPolicy == null) requireWarehouse();
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
            if (item.accessPolicy != null) privateAccess.require(item.accessPolicy, current(), edit, inUsageCommand());
            else requireOrganizationResource();
        } else if (value instanceof org.ash.inventory.model.StorageLocation location) {
            if (location.accessPolicy != null) requireLocationAccess(location, edit);
            else requireOrganizationResource();
        } else if (value instanceof org.ash.inventory.model.Assembly assembly) {
            if (assembly.accessPolicy != null) privateAccess.require(assembly.accessPolicy, current(), edit, inUsageCommand());
            else requireOrganizationResource();
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

    /** Public resources are organization data; tenants only reach private resources (404, like a hidden one). */
    private void requireOrganizationResource() {
        if (!seesOrganization(current())) throw ApiException.notFound("Resource not found");
    }

    /** Inventory admin: write-offs, approvals, users, audit and event planning. */
    public void requireAdmin() {
        requireAtLeast(DomainEnums.UserRole.admin, "Administrator access required");
    }

    /** Warehouse workers: catalog, stock, operations, maintenance, purchasing, preparing and handing out orders (pickup, returns, close), damage reports, history. */
    public void requireWarehouse() {
        requireAtLeast(DomainEnums.UserRole.warehouse_crew, "Warehouse access required");
    }

    /** ASH crew may take out items and pick up prepared orders. */
    public void requireTakeout() {
        requireAtLeast(DomainEnums.UserRole.ash, "Item takeout access required");
    }

    /** ASH crew: general (non-faction) orders. */
    public void requireGeneralOrders() {
        requireAtLeast(DomainEnums.UserRole.ash, "General order access required");
    }

    /** Faction leaders: faction orders and self-service for items in their own custody. */
    public void requireOrdering() {
        requireAtLeast(DomainEnums.UserRole.faction_leader, "Ordering access required");
    }

    /** Read-only and up: public catalog, events, participants and orders. */
    public void requireReader() {
        requireAtLeast(DomainEnums.UserRole.read_only, "Not available for tenant accounts");
    }

    /** Every organization member may read every faction's orders. */
    public boolean canViewFaction(UserAccount actor) {
        return seesOrganization(actor);
    }

    /** Faction memberships are {@code EVENT:slug} keys; faction leaders may only write their own factions. */
    public boolean canWriteFaction(UserAccount actor, org.ash.inventory.model.Faction faction) {
        if (actor.role.atLeast(DomainEnums.UserRole.warehouse_crew)) return true;
        return actor.role.atLeast(DomainEnums.UserRole.faction_leader)
                && actor.factions.contains(factionKey(faction.eventType, faction.slug));
    }

    public void requireFactionView(UserAccount actor) {
        if (!canViewFaction(actor)) throw ApiException.forbidden("Not available for tenant accounts");
    }

    public void requireFactionAccess(UserAccount actor, org.ash.inventory.model.Faction faction) {
        if (!canWriteFaction(actor, faction)) {
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

    static Set<String> parseFactions(String header) {
        var result = new TreeSet<String>();
        Arrays.stream(header.split(",")).map(String::trim).filter(value -> value.contains(":"))
                .forEach(value -> result.add(factionKey(value.substring(0, value.indexOf(':')), value.substring(value.indexOf(':') + 1))));
        return result;
    }

    public static DomainEnums.UserRole parseRole(String value) {
        if (value == null) return null;
        try { return DomainEnums.UserRole.valueOf(value.trim().toLowerCase(Locale.ROOT)); }
        catch (IllegalArgumentException ignored) { return null; }
    }

    public static Set<DomainEnums.UserRole> parseRoles(java.util.Collection<String> values) {
        if (values == null || values.isEmpty()) throw ApiException.badRequest("Assign at least one role");
        var roles = new TreeSet<DomainEnums.UserRole>();
        for (var value : values) {
            var role = parseRole(value);
            if (role == null) throw ApiException.badRequest("Unknown role: " + value);
            roles.add(role);
        }
        return roles;
    }
}
