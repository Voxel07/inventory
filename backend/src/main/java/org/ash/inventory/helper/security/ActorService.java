package org.ash.inventory.helper.security;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.core.HttpHeaders;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.UserOrm;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.ArrayList;
import java.util.Set;

@RequestScoped
public class ActorService {
    @Inject SecurityIdentity identity;
    @Inject HttpHeaders headers;
    @Inject UserOrm users;
    @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled;

    private UserAccount cached;

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
            cached.name = name;
            if (email != null) cached.email = email;
            if (devAuthEnabled || (identity != null && !identity.isAnonymous())) cached.role = role;
        }
        return cached;
    }

    public void requireManager() {
        requireAny("Inventory management access required", DomainEnums.UserRole.hq_admin,
                DomainEnums.UserRole.warehouse_crew);
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
        String value = headers.getHeaderString(name);
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
