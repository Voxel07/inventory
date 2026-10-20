package org.ash.inventory.helper.security;

import org.ash.inventory.model.DomainEnums;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ActorServiceRoleTest {
    @Test
    void accessGroupMembersStartAsReadOnlyWithoutExplicitRoleAssignments() {
        var token = (org.eclipse.microprofile.jwt.JsonWebToken) java.lang.reflect.Proxy.newProxyInstance(
                getClass().getClassLoader(), new Class<?>[]{org.eclipse.microprofile.jwt.JsonWebToken.class},
                (proxy, method, arguments) -> switch (method.getName()) {
                    case "getIssuer" -> "https://identity.example.test";
                    case "getSubject", "getName" -> "new-member";
                    case "getClaim" -> null;
                    default -> throw new UnsupportedOperationException(method.getName());
                });
        var identity = (io.quarkus.security.identity.SecurityIdentity) java.lang.reflect.Proxy.newProxyInstance(
                getClass().getClassLoader(), new Class<?>[]{io.quarkus.security.identity.SecurityIdentity.class},
                (proxy, method, arguments) -> switch (method.getName()) {
                    case "isAnonymous" -> false;
                    case "getPrincipal" -> token;
                    case "getRoles" -> Set.of("inventory");
                    default -> throw new UnsupportedOperationException(method.getName());
                });
        var users = new org.ash.inventory.orm.UserOrm(null, null) {
            @Override public org.ash.inventory.model.UserAccount findByIdentity(String issuer, String subject) { return null; }
            @Override public org.ash.inventory.model.UserAccount provision(String issuer, String subject, String name, String email,
                    Set<DomainEnums.UserRole> roles, java.util.Collection<String> factions) {
                var user = new org.ash.inventory.model.UserAccount();
                user.setRoles(roles);
                return user;
            }
        };
        var actor = new ActorService(identity, null, users, false, "inventory", java.util.Optional.empty());
        assertEquals(DomainEnums.UserRole.read_only, actor.current().role);
    }
    @Test
    void newAccountsDefaultToReadOnlyAndKeepIndependentRoleAssignments() {
        var user = new org.ash.inventory.model.UserAccount();
        assertEquals(DomainEnums.UserRole.read_only, user.role);
        assertEquals(java.util.List.of(DomainEnums.UserRole.read_only), user.roles);
        user.setRoles(ActorService.parseRoles(java.util.List.of("ash", "faction_leader", "ash")));
        assertEquals(java.util.List.of(DomainEnums.UserRole.faction_leader, DomainEnums.UserRole.ash), user.roles);
        assertEquals(DomainEnums.UserRole.ash, user.role);
        user.setRoles(ActorService.parseRoles(java.util.List.of("faction_leader")));
        assertEquals(DomainEnums.UserRole.faction_leader, user.role);
        user.setRoles(ActorService.parseRoles(java.util.List.of("tenant")));
        assertFalse(ActorService.seesOrganization(user));
        assertThrows(org.ash.inventory.resource.ApiException.class, () -> ActorService.parseRoles(java.util.List.of()));
        assertThrows(org.ash.inventory.resource.ApiException.class, () -> ActorService.parseRoles(java.util.List.of("superuser")));
    }
    @Test
    void onlyTheAccessGroupAdmitsAnAccount() {
        assertTrue(ActorService.hasAccess(Set.of("staff", "inventory"), "inventory"));
        assertFalse(ActorService.hasAccess(Set.of("inventory_admin", "inventory_hq_admin", "Inventory"), "inventory"));
        assertFalse(ActorService.hasAccess(Set.of(), "inventory"));
        assertFalse(ActorService.hasAccess(Set.of(""), ""));
    }

    @Test
    void bootstrapAdminsAreCaseInsensitiveAndIgnoreBlanks() {
        assertEquals(Set.of("ada@example.org", "matthias"), ActorService.parseBootstrapAdmins(" Ada@Example.org, ,matthias "));
        assertEquals(Set.of(), ActorService.parseBootstrapAdmins(""));
    }

    @Test
    void bootstrapElevationRequiresAMatchingEmail() {
        var configured = Set.of("ada@example.org", "ada");
        assertTrue(ActorService.isBootstrapAdmin(configured, " Ada@Example.org "));
        assertFalse(ActorService.isBootstrapAdmin(configured, null));
        assertFalse(ActorService.isBootstrapAdmin(configured, "other@example.org"));
    }

    @Test
    void parsesOnlyLadderRoleNames() {
        assertEquals(DomainEnums.UserRole.ash, ActorService.parseRole(" ASH "));
        assertEquals(DomainEnums.UserRole.admin, ActorService.parseRole("admin"));
        assertNull(ActorService.parseRole("hq_admin"));
        assertNull(ActorService.parseRole("marshal"));
    }

    @Test
    void rolesFormALadderWhereEachRoleIncludesTheOnesBelow() {
        var ladder = DomainEnums.UserRole.values();
        assertEquals(java.util.List.of(DomainEnums.UserRole.tenant, DomainEnums.UserRole.read_only,
                DomainEnums.UserRole.faction_leader, DomainEnums.UserRole.ash,
                DomainEnums.UserRole.warehouse_crew, DomainEnums.UserRole.admin), java.util.List.of(ladder));
        for (var role : ladder) for (var minimum : ladder)
            assertEquals(role.ordinal() >= minimum.ordinal(), role.atLeast(minimum), role + " >= " + minimum);
    }

    @Test
    void parsesFactionKeysAsEventSlug() {
        assertEquals(Set.of("DE:kgg", "LS:tera"), ActorService.parseFactions(" de:KGG, LS:tera ,invalid"));
    }

    @Test
    void productionRejectsDevelopmentAuthenticationAndMissingOidc() {
        assertThrows(IllegalStateException.class, () -> ProductionAuthGuard.check(true, true));
        assertThrows(IllegalStateException.class, () -> ProductionAuthGuard.check(false, false));
        ProductionAuthGuard.check(false, true);
    }
}
