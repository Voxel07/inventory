package org.ash.inventory.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkiverse.mcp.server.Resource;
import io.quarkiverse.mcp.server.TextResourceContents;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.ash.inventory.service.McpInventoryService;

@ApplicationScoped
public class InventoryMcpResources {

    @Inject
    McpInventoryService service;

    @Inject
    ObjectMapper mapper;

    @Resource(uri = "inventory://system/overview", name = "System Overview", description = "High-level overview and schema metadata of the ASH Inventory system")
    @Transactional
    public TextResourceContents systemOverview() {
        service.authenticate();
        String info = """
                # ASH Inventory Management System
                - Purpose: Event-driven inventory management for Airsoft events and operations.
                - Features:
                  * Storage tree: top-level locations (sites, no stock) → sections → nested storage places (shelves, compartments).
                  * Company-owned and privately-owned inventory segregation.
                  * Assembly composition (bills of materials).
                  * Serialized asset tracking (generators, firearms, optics, comms).
                  * Event planning, order allocations, check-out / return custody workflows.
                """;
        return TextResourceContents.create("inventory://system/overview", info);
    }

    @Resource(uri = "inventory://locations", name = "Storage Locations", description = "Current list of active storage locations (locations, sections, storage places)")
    @Transactional
    public TextResourceContents locations() throws Exception {
        service.authenticate();
        var data = service.locationResource();
        return TextResourceContents.create("inventory://locations", mapper.writerWithDefaultPrettyPrinter().writeValueAsString(data));
    }

    @Resource(uri = "inventory://categories", name = "Catalog Categories", description = "Distinct item categories in the inventory catalog")
    @Transactional
    public TextResourceContents categories() throws Exception {
        service.authenticate();
        var categories = service.categories();
        return TextResourceContents.create("inventory://categories", mapper.writerWithDefaultPrettyPrinter().writeValueAsString(categories));
    }
}
