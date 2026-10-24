package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.UserOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
/**
 * Accounts are provisioned from the identity provider (access group membership); their role and
 * faction memberships are managed here by the inventory admin.
 */
@ApplicationScoped
public class UserService {
    private final UserOrm users;
    @jakarta.inject.Inject ActorService actors;
    @jakarta.inject.Inject DomainEventService events;

    public UserService(UserOrm users) {
        this.users = users;
    }

    /** Sets a user's role and factions; audited, revision-checked, and never removes the last admin. */
    @Transactional
    public UserAccount updateAccess(java.util.UUID id, ApiModels.UserAccessInput input) {
        actors.requireAdmin();
        var roles = ActorService.parseRoles(input.roles());
        var factions = new java.util.TreeSet<String>();
        for (var key : input.factions()) {
            int separator = key == null ? -1 : key.indexOf(':');
            if (separator <= 0 || separator == key.length() - 1) throw ApiException.badRequest("Factions must be EVENT:slug keys");
            String eventType = key.substring(0, separator).trim().toUpperCase(java.util.Locale.ROOT);
            String slug = key.substring(separator + 1).trim().toLowerCase(java.util.Locale.ROOT);
            if (!users.factionExists(eventType, slug)) throw ApiException.badRequest("Unknown faction: " + key);
            factions.add(ActorService.factionKey(eventType, slug));
        }
        users.lockAdmins();
        var user = users.findLocked(id);
        if (user == null) throw ApiException.notFound("User not found");
        if (user.accessRevision != input.revision()) throw ApiException.conflict("User changed; reload");
        if (user.active && user.role == DomainEnums.UserRole.admin && !roles.contains(DomainEnums.UserRole.admin) && users.admins() <= 1)
            throw ApiException.conflict("Keep at least one inventory admin");
        var before = java.util.Map.of("roles", java.util.List.copyOf(user.roles), "factions", java.util.List.copyOf(user.factions));
        user.setRoles(roles);
        user.factions = new java.util.ArrayList<>(factions);
        user.accessRevision++;
        events.record("user.changed", "user", user.id, actors.current().id, null, java.util.Map.of(
                "before", before, "after", java.util.Map.of("roles", java.util.List.copyOf(user.roles), "factions", java.util.List.copyOf(factions)),
                "reason", input.reason().trim()));
        return user;
    }

    /** The current user chooses their own ntfy topic; null or blank clears it. */
    @Transactional
    public UserAccount updateNtfyTopic(String topic) {
        var user = users.findLocked(actors.current().id);
        user.ntfyTopic = topic == null || topic.isBlank() ? null : topic;
        return user;
    }

    @Transactional
    public UserAccount devLogin(ApiModels.DevLoginInput input) {
        var user = users.findByIdentity(ActorService.DEV_ISSUER, input.email());
        if (user != null) return user;
        String name = input.email().contains("@") ? input.email().substring(0, input.email().indexOf('@')) : input.email();
        var provisioned = users.provision(ActorService.DEV_ISSUER, input.email(), name, input.email(),
                java.util.Set.of(DomainEnums.UserRole.admin), java.util.List.of());
        if (provisioned.created()) actors.recordCreated(provisioned.user());
        return provisioned.user();
    }
}
