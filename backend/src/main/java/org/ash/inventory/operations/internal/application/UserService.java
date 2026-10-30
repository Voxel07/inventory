package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.notification.api.PersonalWebhookPublisher;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.UserOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.Map;
/**
 * Accounts are provisioned from the identity provider (access group membership); their role and
 * faction memberships are managed here by the inventory admin.
 */
@ApplicationScoped
public class UserService {
    private final UserOrm users;
    @jakarta.inject.Inject ActorService actors;
    @jakarta.inject.Inject DomainEventService events;
    @jakarta.inject.Inject NtfyTopicFeed adminTopics;

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

    /** The current user chooses their own ntfy topic and webhook; null or blank clears one. */
    @Transactional
    public UserAccount updateNotificationSettings(ApiModels.NotificationSettingsInput input) {
        String webhook = input.webhookUrl() == null || input.webhookUrl().isBlank() ? null : input.webhookUrl();
        if (webhook != null) {
            try { webhook = PersonalWebhookPublisher.validate(webhook); }
            catch (IllegalArgumentException invalid) { throw ApiException.badRequest(invalid.getMessage()); }
        }
        String topic = input.ntfyTopic() == null || input.ntfyTopic().isBlank() ? null : input.ntfyTopic();
        if (adminTopics.reserved(topic)) throw ApiException.badRequest("This ntfy topic is reserved for administrator notifications");
        var user = users.findLocked(actors.current().id);
        user.ntfyTopic = topic;
        user.webhookUrl = webhook;
        return user;
    }

    /** Destinations that fit beside "More" in the phone's bottom bar, and beside the profile in its top bar. */
    private static final Map<String, Integer> MOBILE_NAVIGATION_LIMITS = Map.of("bottom", 4, "top", 2);

    /** The current user places phone destinations in the bottom or top bar; null restores the default layout. */
    @Transactional
    public UserAccount updateMobileNavigation(ApiModels.MobileNavigationInput input) {
        var placements = input.placements();
        if (placements != null) MOBILE_NAVIGATION_LIMITS.forEach((bar, limit) -> {
            if (placements.values().stream().filter(bar::equals).count() > limit)
                throw ApiException.badRequest("At most " + limit + " destinations fit in the " + bar + " bar");
        });
        var user = users.findLocked(actors.current().id);
        user.mobileNavigation = placements == null ? null : new java.util.TreeMap<>(placements);
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
