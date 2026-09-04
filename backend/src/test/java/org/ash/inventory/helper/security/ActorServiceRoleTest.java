package org.ash.inventory.helper.security;

import org.ash.inventory.model.DomainEnums;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ActorServiceRoleTest {
    @Test
    void mapsNamespacedAuthentikGroupsToInternalRoles() {
        assertEquals(DomainEnums.UserRole.admin,
                ActorService.roleFrom(Set.of("inventory_admin")));
        assertEquals(DomainEnums.UserRole.inventory_manager,
                ActorService.roleFrom(Set.of("inventory_manager")));
        assertEquals(DomainEnums.UserRole.warehouse_packer,
                ActorService.roleFrom(Set.of("inventory_warehouse_packer")));
        assertEquals(DomainEnums.UserRole.faction_leader,
                ActorService.roleFrom(Set.of("inventory_faction_leader")));
    }

    @Test
    void ignoresUnprefixedAndUnrelatedGroups() {
        assertEquals(DomainEnums.UserRole.faction_leader,
                ActorService.roleFrom(Set.of("admin", "warehouse_packer", "another_app_admin")));
    }

    @Test
    void appliesMostPrivilegedInventoryRoleWhenSeveralArePresent() {
        assertEquals(DomainEnums.UserRole.admin,
                ActorService.roleFrom(Set.of(
                        "inventory_faction_leader",
                        "inventory_warehouse_packer",
                        "inventory_manager",
                        "inventory_admin")));
    }
}
