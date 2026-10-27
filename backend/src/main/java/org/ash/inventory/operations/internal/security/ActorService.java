package org.ash.inventory.operations.internal.security;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.application.AuthSessionService;
import org.ash.inventory.operations.internal.model.Assembly;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Faction;
import org.ash.inventory.operations.internal.model.InventoryAccessGrant;
import org.ash.inventory.operations.internal.model.InventoryAccessGroup;
import org.ash.inventory.operations.internal.model.InventoryAccessPolicy;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.UserOrm;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.persistence.BaseEntity;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.transaction.Transactional;
import io.quarkus.vertx.http.runtime.CurrentVertxRequest;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/**
 * Resolves the calling account. The identity provider decides who may use the inventory at all
 * (membership in the access group, default {@code inventory}); the role and faction memberships are
 * managed in the app by the inventory admin. Accounts are keyed by {@code (issuer, sub)}; new accounts
 * start as {@code read_only} unless their e-mail is listed as a bootstrap admin. Name and e-mail
 * are never used as account keys.
 */
@RequestScoped
public class ActorService {
    /** Issuer recorded for header-based development accounts. */
    public static final String DEV_ISSUER = "dev";
    /** Pre-launch only: an administrator acts as the account with this ID for the request; events record both. */
    public static final String IMPERSONATE_HEADER = "X-Impersonate-User";

    @jakarta.inject.Inject InventoryAccess privateAccess;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.AuthSessionService sessions;
    @jakarta.inject.Inject DomainEventService events;
    @ConfigProperty(name = "inventory.impersonation.enabled", defaultValue = "false") boolean impersonationEnabled;
    @jakarta.inject.Inject org.ash.inventory.platform.api.ImpersonationContext impersonation;
    private static final org.jboss.logging.Logger LOG = org.jboss.logging.Logger.getLogger(ActorService.class);
    private final SecurityIdentity identity;
    private final CurrentVertxRequest request;
    private final UserOrm users;
    private final boolean devAuthEnabled;
    private final String accessGroup;
    private final Set<String> bootstrapAdmins;

    private UserAccount cached;
    private UserAccount authenticated;
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
            if (!cached.active) throw ApiException.forbidden("This inventory account is deactivated");
            // Sync replay and response filters can open another transaction in the
            // same request. Reuse only an entity managed by the current context.
            if (users.isManaged(cached)) return cached;
            var managed = users.find(cached.id);
            if (managed != null) {
                cached = managed;
                if (!cached.active) throw ApiException.forbidden("This inventory account is deactivated");
                return cached;
            }
        }
        String issuer;
        String subject;
        String name;
        String email;
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
            if (sessions != null && sessions.revoked(token)) throw new ApiException(401, "Session revoked");
            name = firstClaim(token, subject, "name", "preferred_username");
            email = firstClaim(token, null, "email");
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
        if (cached != null && !cached.active) throw ApiException.forbidden("This inventory account is deactivated");
        boolean bootstrap = isBootstrapAdmin(bootstrapAdmins, email);
        if (cached == null) {
            var provisioned = users.provision(issuer, subject, name, email,
                    headerRoles != null ? headerRoles : Set.of(bootstrap ? DomainEnums.UserRole.admin : DomainEnums.UserRole.read_only),
                    headerFactions == null ? List.of() : headerFactions);
            cached = provisioned.user();
            if (provisioned.created()) recordCreated(cached);
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
        authenticated = cached;
        String target = header(IMPERSONATE_HEADER, null);
        if (target != null) {
            // A rejected impersonation must not leave the administrator cached for later calls in this request.
            cached = null;
            cached = impersonate(authenticated, target);
        }
        return cached;
    }

    /** The signed-in account, which differs from {@link #current()} only while an administrator impersonates. */
    public UserAccount authenticated() {
        current();
        return authenticated;
    }

    /** The impersonated account is the actor; domain events also record the administrator (impersonator_id). */
    private UserAccount impersonate(UserAccount admin, String target) {
        if (!impersonationEnabled) throw ApiException.badRequest("Impersonation is disabled");
        if (!admin.role.atLeast(DomainEnums.UserRole.admin)) throw ApiException.forbidden("Only administrators may impersonate accounts");
        java.util.UUID id;
        try { id = java.util.UUID.fromString(target.trim()); }
        catch (IllegalArgumentException invalid) { throw ApiException.badRequest("Invalid impersonation target"); }
        var user = users.find(id);
        if (user == null) throw ApiException.notFound("Impersonated account not found");
        if (!user.active) throw ApiException.conflict("Deactivated accounts cannot be impersonated");
        impersonation.impersonatedBy(admin.id);
        var context = request.getCurrent();
        LOG.infof("Impersonation: administrator=%s acts as account=%s request=%s %s", admin.id, user.id,
                context == null ? "-" : context.request().method(), context == null ? "-" : context.normalizedPath());
        return user;
    }

    /** First contact of an identity; the account provisions itself, so it is its own actor. */
    public void recordCreated(UserAccount user) {
        events.record("user.created", "user", user.id, user.id, null,
                java.util.Map.of("roles", List.copyOf(user.roles), "factions", List.copyOf(user.factions)));
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

    static boolean isBootstrapAdmin(Set<String> configured, String email) {
        return email != null && configured.contains(email.trim().toLowerCase(Locale.ROOT));
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

    /** Read-only members only read; tenants and every role from faction leader up own private inventory. */
    public static boolean createsInventory(UserAccount actor) {
        return actor.role != DomainEnums.UserRole.read_only;
    }

    /** Items, assemblies and storage locations: read-only accounts cannot add any, not even private ones. */
    public void requireInventoryCreation() {
        if (!createsInventory(current())) throw ApiException.forbidden("Read-only accounts cannot add inventory");
    }

    /** Mirrors {@link org.ash.inventory.operations.internal.persistence.InventoryAccessOrm#visible}: the access policy is the only item visibility. */
    public boolean canViewItem(org.ash.inventory.operations.internal.model.Item item, UserAccount actor) {
        if (item.accessPolicy != null) return privateAccess.allows(item.accessPolicy, actor, false);
        return seesOrganization(actor);
    }

    public void requireItemAccess(org.ash.inventory.operations.internal.model.Item item) {
        if (item == null || !item.active || !canViewItem(item, current())) throw ApiException.notFound("Item not found");
    }

    public boolean canViewLocation(org.ash.inventory.operations.internal.model.StorageLocation location) {
        return location != null && privateAccess.allows(location.accessPolicy, current(), false);
    }
    public void requireLocationAccess(org.ash.inventory.operations.internal.model.StorageLocation location, boolean edit) {
        if (location == null) throw ApiException.notFound("Location not found");
        privateAccess.require(location.accessPolicy, current(), edit, inUsageCommand());
    }
    public void requireItemEdit(org.ash.inventory.operations.internal.model.Item item) {
        requireItemAccess(item);
        if (item.accessPolicy == null) requireWarehouse();
        else privateAccess.require(item.accessPolicy, current(), true, inUsageCommand());
    }
    /** Private assemblies follow their own policy; public ones are catalog data managed by inventory staff. */
    public void requireAssemblyEdit(org.ash.inventory.operations.internal.model.Assembly assembly) {
        if (assembly == null) throw ApiException.notFound("Assembly not found");
        if (assembly.accessPolicy == null) {
            if (!seesOrganization(current())) throw ApiException.notFound("Assembly not found");
            requireWarehouse();
        } else privateAccess.require(assembly.accessPolicy, current(), true, inUsageCommand());
    }
    public void requireLocationEdit(org.ash.inventory.operations.internal.model.StorageLocation location) {
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
        if (value == null || !(value instanceof org.ash.inventory.platform.persistence.BaseEntity)) return;
        value = org.hibernate.Hibernate.unproxy(value);
        if (!visited.add(value)) return;
        if (value instanceof org.ash.inventory.operations.internal.model.Item item) {
            if (item.accessPolicy != null) privateAccess.require(item.accessPolicy, current(), edit, inUsageCommand());
            else requireOrganizationResource();
        } else if (value instanceof org.ash.inventory.operations.internal.model.StorageLocation location) {
            if (location.accessPolicy != null) requireLocationAccess(location, edit);
            else requireOrganizationResource();
        } else if (value instanceof org.ash.inventory.operations.internal.model.Assembly assembly) {
            if (assembly.accessPolicy != null) privateAccess.require(assembly.accessPolicy, current(), edit, inUsageCommand());
            else requireOrganizationResource();
        } else if (!(value instanceof UserAccount)
                && !(value instanceof org.ash.inventory.operations.internal.model.InventoryAccessPolicy)
                && !(value instanceof org.ash.inventory.operations.internal.model.InventoryAccessGroup)
                && !(value instanceof org.ash.inventory.operations.internal.model.InventoryAccessGrant)) {
            // Follow singular resource associations (repair -> damage -> item, loan -> commitment -> item).
            // Collections and user/group graphs are deliberately excluded; collection queries have their own scopes.
            for (var field : value.getClass().getFields()) {
                if (!org.ash.inventory.platform.persistence.BaseEntity.class.isAssignableFrom(field.getType())) continue;
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
    public boolean canWriteFaction(UserAccount actor, org.ash.inventory.operations.internal.model.Faction faction) {
        if (actor.role.atLeast(DomainEnums.UserRole.warehouse_crew)) return true;
        return actor.role.atLeast(DomainEnums.UserRole.faction_leader)
                && actor.factions.contains(factionKey(faction.eventType, faction.slug));
    }

    public void requireFactionAccess(UserAccount actor, org.ash.inventory.operations.internal.model.Faction faction) {
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
