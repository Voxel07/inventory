package org.ash.inventory.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class LocationCodeTest {
    @Test void derivesShortCodesFromNames() {
        assertEquals("TL1", LocationHierarchyService.deriveCode("Technik-Lager 1"));
        assertEquals("R3", LocationHierarchyService.deriveCode("Regal 3"));
        assertEquals("F12", LocationHierarchyService.deriveCode("Fach 12"));
        assertEquals("FUNK", LocationHierarchyService.deriveCode("Funkraum"));
        assertEquals("KS", LocationHierarchyService.deriveCode("Kabelkiste Strom"));
        assertEquals("GAE", LocationHierarchyService.deriveCode("Gä"));
        assertEquals("LOC", LocationHierarchyService.deriveCode("  "));
    }
}
