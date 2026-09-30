package org.ash.inventory.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkiverse.mcp.server.Resource;
import io.quarkiverse.mcp.server.TextResourceContents;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.ash.inventory.model.StorageLocation;

import java.util.List;
import java.util.Map;

@ApplicationScoped
public class InventoryMcpResources {

    @Inject
    EntityManager em;

    @Inject
    ObjectMapper mapper;

    @Resource(uri = "inventory://system/overview", name = "System Overview", description = "High-level overview and schema metadata of the ASH Inventory system")
    public TextResourceContents systemOverview() {
        String info = """
                # ASH Inventory Management System
                - Purpose: Event-driven inventory management for Airsoft events and operations.
                - Features:
                  * Multi-location storage tracking (warehouses, bins, staging areas).
                  * Company-owned and privately-owned inventory segregation.
                  * Assembly composition (bills of materials).
                  * Serialized asset tracking (generators, firearms, optics, comms).
                  * Event planning, order allocations, check-out / return custody workflows.
                """;
        return TextResourceContents.create("inventory://system/overview", info);
    }

    @Resource(uri = "inventory://locations", name = "Storage Locations", description = "Current list of active storage locations and warehouses")
    @Transactional
    public TextResourceContents locations() throws Exception {
        List<StorageLocation> list = em.createQuery(
                "from StorageLocation l left join fetch l.warehouse where l.active = true order by l.name",
                StorageLocation.class).getResultList();
        var data = list.stream().map(l -> Map.of(
                "id", l.id.toString(),
                "name", l.name,
                "type", l.locationType != null ? l.locationType.name() : "unknown",
                "warehouse", l.warehouse != null ? l.warehouse.name : "none"
        )).toList();
        return TextResourceContents.create("inventory://locations", mapper.writerWithDefaultPrettyPrinter().writeValueAsString(data));
    }

    @Resource(uri = "inventory://categories", name = "Catalog Categories", description = "Distinct item categories in the inventory catalog")
    @Transactional
    public TextResourceContents categories() throws Exception {
        List<String> categories = em.createQuery(
                "select distinct i.category from Item i where i.active = true and i.category is not null order by i.category",
                String.class).getResultList();
        return TextResourceContents.create("inventory://categories", mapper.writerWithDefaultPrettyPrinter().writeValueAsString(categories));
    }
}
