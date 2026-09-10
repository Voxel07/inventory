package org.ash.inventory.helper.security;

import org.ash.inventory.model.DomainEnums;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ActorServiceRoleTest {
    @Test
    void mapsNamespacedAuthentikGroupsToInternalRoles() {
        assertEquals(DomainEnums.UserRole.faction_leader,
                ActorService.roleFrom(Set.of("inventory_faction_leader")));
        assertEquals(DomainEnums.UserRole.hq_admin,
                ActorService.roleFrom(Set.of("inventory_hq_admin")));
        assertEquals(DomainEnums.UserRole.warehouse_crew,
                ActorService.roleFrom(Set.of("inventory_warehouse_crew")));
        assertEquals(DomainEnums.UserRole.marshal,
                ActorService.roleFrom(Set.of("inventory_marshal")));
        assertEquals(DomainEnums.UserRole.event_planner,
                ActorService.roleFrom(Set.of("inventory_event_planner")));
        assertEquals(DomainEnums.UserRole.maintenance_crew,
                ActorService.roleFrom(Set.of("inventory_maintenance_crew")));
        assertEquals(DomainEnums.UserRole.read_only,
                ActorService.roleFrom(Set.of("inventory_read_only")));
    }

    @Test
    void ignoresUnprefixedAndUnrelatedGroups() {
        assertEquals(DomainEnums.UserRole.faction_leader,
                ActorService.roleFrom(Set.of("admin", "inventory_admin", "inventory_manager",
                        "inventory_warehouse_packer", "another_app_admin")));
    }

    @Test
    void appliesMostPrivilegedInventoryRoleWhenSeveralArePresent() {
        assertEquals(DomainEnums.UserRole.hq_admin,
                ActorService.roleFrom(Set.of(
                        "inventory_faction_leader",
                        "inventory_warehouse_crew",
                        "inventory_marshal",
                        "inventory_hq_admin")));
    }
}
