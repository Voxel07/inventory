package org.ash.inventory.helper.security;

import org.ash.inventory.model.DomainEnums;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

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
    void accountsWithoutAnInventoryRoleGetNoRole() {
        assertNull(ActorService.roleFrom(Set.of()));
        assertNull(ActorService.roleFrom(Set.of("admin", "inventory_admin", "inventory_manager",
                "inventory_warehouse_packer", "another_app_admin", "inventory_faction_DE_kgg")));
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

    @Test
    void mapsFactionGroupsToEventSlugKeys() {
        assertEquals(Set.of("DE:kgg", "TNO:freiheit", "M24:hondra-west"),
                ActorService.factionsFrom(Set.of("inventory_faction_leader", "inventory_faction_DE_kgg",
                        "inventory_faction_tno_Freiheit", "inventory_faction_M24_hondra-west",
                        "inventory_faction_DE_", "inventory_faction__x", "inventory_hq_admin")));
        assertEquals(Set.of("DE:kgg", "LS:tera"), ActorService.parseFactions(" de:KGG, LS:tera ,invalid"));
    }

    @Test
    void productionRejectsDevelopmentAuthenticationAndMissingOidc() {
        assertThrows(IllegalStateException.class, () -> ProductionAuthGuard.check(true, true));
        assertThrows(IllegalStateException.class, () -> ProductionAuthGuard.check(false, false));
        ProductionAuthGuard.check(false, true);
    }
}
