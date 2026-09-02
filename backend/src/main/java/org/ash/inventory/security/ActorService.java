package org.ash.inventory.security;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.core.HttpHeaders;
import org.ash.inventory.api.ApiException;
import org.ash.inventory.domain.DomainEnums;
import org.ash.inventory.domain.UserAccount;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.ArrayList;
import java.util.Set;

@RequestScoped
public class ActorService {
    @Inject SecurityIdentity identity;
    @Inject HttpHeaders headers;
    @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled;

    private UserAccount cached;

    @Transactional
    public UserAccount current() {
        if (cached != null) return cached;
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
            subject = header("X-Actor-Id", "dev-admin");
            name = header("X-Actor-Name", "Development Admin");
            email = subject.contains("@") ? subject : "dev@localhost";
            role = parseRole(header("X-Actor-Role", "admin"));
        } else {
            throw new ApiException(401, "Authentication required");
        }

        cached = UserAccount.find("externalSubject", subject).firstResult();
        if (cached == null) {
            cached = new UserAccount();
            cached.externalSubject = subject;
            cached.name = name;
            cached.email = email;
            cached.role = role;
            cached.factions = new ArrayList<>(factions);
            cached.persist();
        } else {
            cached.name = name;
            if (email != null) cached.email = email;
            if (!identity.isAnonymous()) cached.role = role;
        }
        return cached;
    }

    public void requireManager() {
        var role = current().role;
        if (role != DomainEnums.UserRole.admin && role != DomainEnums.UserRole.inventory_manager && role != DomainEnums.UserRole.warehouse_packer) {
            throw ApiException.forbidden("Inventory manager access required");
        }
    }

    public void requireAdmin() {
        if (current().role != DomainEnums.UserRole.admin) throw ApiException.forbidden("Administrator access required");
    }

    private String header(String name, String fallback) {
        String value = headers.getHeaderString(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private String stringAttribute(String name, String fallback) {
        Object value = identity.getAttribute(name);
        return value == null ? fallback : value.toString();
    }

    private DomainEnums.UserRole roleFrom(Set<String> roles) {
        if (roles.contains("admin")) return DomainEnums.UserRole.admin;
        if (roles.contains("inventory_manager")) return DomainEnums.UserRole.inventory_manager;
        if (roles.contains("warehouse_packer")) return DomainEnums.UserRole.warehouse_packer;
        return DomainEnums.UserRole.faction_leader;
    }

    private DomainEnums.UserRole parseRole(String value) {
        try { return DomainEnums.UserRole.valueOf(value.trim().toLowerCase()); }
        catch (IllegalArgumentException ignored) { return DomainEnums.UserRole.faction_leader; }
    }
}
