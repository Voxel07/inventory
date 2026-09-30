package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.mcp.InventoryMcpPrompts;
import org.ash.inventory.mcp.InventoryMcpResources;
import org.ash.inventory.mcp.InventoryMcpTools;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.InventoryPosition;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.StorageLocation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
class InventoryMcpTest {

    @Inject
    EntityManager em;

    @Inject
    InventoryMcpTools tools;

    @Inject
    InventoryMcpResources resources;

    @Inject
    InventoryMcpPrompts prompts;

    private Item testItem;
    private StorageLocation testLocation;
    private AssetInstance testAsset;
    private EventOccurrence testEvent;

    @BeforeEach
    void setupTestData() {
        QuarkusTransaction.requiringNew().run(() -> {
            testLocation = new StorageLocation();
            testLocation.name = "MCP Armory " + UUID.randomUUID().toString().substring(0, 6);
            testLocation.locationType = DomainEnums.LocationType.warehouse;
            testLocation.area = "Sector Alpha";
            em.persist(testLocation);

            testItem = new Item();
            testItem.sku = "MCP-ITEM-" + UUID.randomUUID().toString().substring(0, 8);
            testItem.name = "Tactical Radio MCP";
            testItem.category = "Communications";
            testItem.subcategory = "VHF";
            testItem.storageLocation = testLocation;
            testItem.minStock = 5;
            testItem.baseAmount = 10;
            testItem.trackingMode = DomainEnums.TrackingMode.serialized;
            testItem.ownershipType = Item.Ownership.organization;
            testItem.maintenanceStatus = DomainEnums.MaintenanceStatus.certified;
            em.persist(testItem);

            InventoryPosition pos = new InventoryPosition();
            pos.item = testItem;
            pos.location = testLocation;
            pos.quantityOnHand = 3;
            pos.quantityReserved = 1;
            em.persist(pos);

            testAsset = new AssetInstance();
            testAsset.item = testItem;
            testAsset.assetCode = "AST-MCP-" + UUID.randomUUID().toString().substring(0, 8);
            testAsset.serialNumber = "SN-998877";
            testAsset.currentLocation = testLocation;
            testAsset.conditionStatus = DomainEnums.ConditionStatus.good;
            testAsset.availabilityStatus = DomainEnums.AssetState.available;
            testAsset.serviceStatus = DomainEnums.MaintenanceStatus.certified;
            em.persist(testAsset);

            testEvent = new EventOccurrence();
            testEvent.name = "Operation MCP Nightfall";
            testEvent.eventType = "MILSIM";
            testEvent.startDate = LocalDate.now().plusDays(7);
            testEvent.endDate = LocalDate.now().plusDays(9);
            testEvent.status = "planned";
            em.persist(testEvent);
        });
    }

    // ==========================================
    // ITEM CRUD TESTS
    // ==========================================

    @Test
    void testItemCrudOperations() {
        // 1. Create item
        String uniqueName = "Night Vision Goggles Gen3 " + UUID.randomUUID().toString().substring(0, 6);
        var created = tools.create_item(
                uniqueName,
                "Optics",
                null, // auto-generated SKU
                "High performance Gen3 dual tube NVG",
                "NVG",
                "L3Harris",
                false,
                4, // initial amount
                2, // min stock
                3500.00,
                testLocation.id.toString(),
                "Armory Rack A-3",
                "Handle with optical care",
                "serialized",
                "returnable"
        );

        assertNotNull(created);
        assertNotNull(created.id());
        assertNotNull(created.sku());
        assertEquals(uniqueName, created.name());
        assertEquals("Optics", created.category());
        assertEquals(4, created.baseAmount());
        assertEquals(2, created.minStock());
        assertEquals("serialized", created.trackingMode());
        assertTrue(created.active());

        // 2. Read item details
        var fetched = tools.get_item_details(created.id().toString());
        assertNotNull(fetched);
        assertEquals(created.id(), fetched.id());
        assertEquals(uniqueName, fetched.name());

        // 3. Search items
        var searchResults = tools.search_items("Night Vision", "Optics", 10);
        assertNotNull(searchResults);
        assertTrue(searchResults.stream().anyMatch(i -> i.id().equals(created.id())));

        // 4. Update item
        String updatedDescription = "Updated: High-res Gen3 White Phosphor tubes";
        var updated = tools.update_item(
                created.id().toString(),
                null,
                updatedDescription,
                null,
                null,
                null,
                3, // updated minStock
                null,
                null,
                null,
                "Armory Safe B-1",
                null,
                90, // maintenance interval
                null,
                null
        );

        assertNotNull(updated);
        assertEquals(updatedDescription, updated.description());
        assertEquals(3, updated.minStock());
        assertEquals("Armory Safe B-1", updated.positionDetails());

        // 5. Delete / Retire item
        var deleteResult = tools.delete_item(created.id().toString(), false);
        assertNotNull(deleteResult);
        assertTrue(deleteResult.success());
        assertEquals(created.id(), deleteResult.id());

        var afterRetire = tools.get_item_details(created.id().toString());
        assertFalse(afterRetire.active());
    }

    // ==========================================
    // ASSEMBLY CRUD TESTS
    // ==========================================

    @Test
    void testAssemblyCrudOperations() {
        // 1. Create assembly
        String assemblyName = "Squad Comms Kit " + UUID.randomUUID().toString().substring(0, 6);
        Map<String, Integer> components = Map.of(testItem.id.toString(), 2);

        var created = tools.create_assembly(
                assemblyName,
                "Standard 2-man communications pack",
                "Store radios in protective pouch",
                List.of("MILSIM", "CQB"),
                components
        );

        assertNotNull(created);
        assertNotNull(created.id());
        assertEquals(assemblyName, created.name());
        assertEquals(1, created.components().size());
        assertEquals(2, created.components().get(0).quantity());
        assertEquals(testItem.id, created.components().get(0).itemId());

        // 2. Read assembly details
        var fetched = tools.get_assembly_details(created.id().toString());
        assertNotNull(fetched);
        assertEquals(assemblyName, fetched.name());
        assertEquals("Standard 2-man communications pack", fetched.description());

        // 3. List assemblies
        var list = tools.list_assemblies("MILSIM");
        assertNotNull(list);
        assertTrue(list.stream().anyMatch(a -> a.id().equals(created.id())));

        // 4. Update assembly
        var updated = tools.update_assembly(
                created.id().toString(),
                assemblyName + " Updated",
                "Upgraded communications kit",
                null,
                List.of("MILSIM", "PATROL"),
                Map.of(testItem.id.toString(), 4) // update quantity to 4
        );

        assertNotNull(updated);
        assertEquals(assemblyName + " Updated", updated.name());
        assertEquals(1, updated.components().size());
        assertEquals(4, updated.components().get(0).quantity());

        // 5. Delete assembly
        var deleteResult = tools.delete_assembly(created.id().toString());
        assertNotNull(deleteResult);
        assertTrue(deleteResult.success());
        assertEquals(created.id(), deleteResult.id());
    }

    // ==========================================
    // EVENT CRUD TESTS
    // ==========================================

    @Test
    void testEventCrudOperations() {
        // 1. Create event
        String eventName = "Operation Desert Storm " + UUID.randomUUID().toString().substring(0, 6);
        String start = LocalDate.now().plusDays(14).toString();
        String end = LocalDate.now().plusDays(16).toString();
        Map<String, Integer> quotas = Map.of(testItem.id.toString(), 5);

        var created = tools.create_event(
                "MILSIM",
                eventName,
                start,
                end,
                "planned",
                "Weekend deployment in Sector Charlie",
                quotas
        );

        assertNotNull(created);
        assertNotNull(created.id());
        assertEquals(eventName, created.name());
        assertEquals("MILSIM", created.eventType());
        assertEquals("planned", created.status());
        assertEquals(5, created.plannedQuantities().get(testItem.id.toString()));

        // 2. Read event details
        var fetched = tools.get_event_details(created.id().toString());
        assertNotNull(fetched);
        assertEquals(eventName, fetched.name());
        assertEquals(start, fetched.startDate());

        // 3. List events
        var list = tools.list_events("planned");
        assertNotNull(list);
        assertTrue(list.stream().anyMatch(e -> e.id().equals(created.id())));

        // 4. Update event
        var updated = tools.update_event(
                created.id().toString(),
                eventName + " Active",
                null,
                null,
                null,
                "active",
                "Deployment currently ongoing",
                null,
                Map.of(testItem.id.toString(), 4) // used quantity
        );

        assertNotNull(updated);
        assertEquals(eventName + " Active", updated.name());
        assertEquals("active", updated.status());
        assertEquals(4, updated.usedQuantities().get(testItem.id.toString()));

        // 5. Delete event
        var deleteResult = tools.delete_event(created.id().toString());
        assertNotNull(deleteResult);
        assertTrue(deleteResult.success());
        assertEquals(created.id(), deleteResult.id());
    }

    // ==========================================
    // OPERATIONAL TOOLS & MCP HTTP TESTS
    // ==========================================

    @Test
    void testOperationalTools() {
        var locations = tools.list_storage_locations(null);
        assertNotNull(locations);
        assertFalse(locations.isEmpty());

        var positions = tools.get_inventory_positions(testItem.id.toString());
        assertNotNull(positions);
        assertFalse(positions.isEmpty());

        var assets = tools.list_asset_instances(testItem.id.toString(), null);
        assertNotNull(assets);
        assertFalse(assets.isEmpty());

        var lowStock = tools.check_low_stock_items(0);
        assertNotNull(lowStock);

        var summary = tools.get_operational_summary();
        assertNotNull(summary);
        assertTrue(summary.totalActiveItems() > 0);

        var alerts = tools.get_maintenance_alerts();
        assertNotNull(alerts);
    }

    @Test
    void testResources() throws Exception {
        var overview = resources.systemOverview();
        assertNotNull(overview);
        assertTrue(overview.text().contains("ASH Inventory"));

        var locs = resources.locations();
        assertNotNull(locs);

        var cats = resources.categories();
        assertNotNull(cats);
    }

    @Test
    void testPrompts() {
        var readiness = prompts.eventReadinessAudit("Operation Alpha", "Comms");
        assertNotNull(readiness);
        assertTrue(readiness.content().asText().text().contains("Operation Alpha"));

        var restock = prompts.procurementRestockPlan("Radio Supply Co");
        assertNotNull(restock);
        assertTrue(restock.content().asText().text().contains("Radio Supply Co"));
    }

    @Test
    void testMcpHttpEndpointInitializeAndListTools() {
        // 1. Initialize MCP Session
        Map<String, Object> initRequest = Map.of(
                "jsonrpc", "2.0",
                "id", 1,
                "method", "initialize",
                "params", Map.of(
                        "protocolVersion", "2024-11-05",
                        "capabilities", Map.of(),
                        "clientInfo", Map.of("name", "test-client", "version", "1.0.0")
                )
        );

        var initResponse = given()
                .header("Accept", "application/json, text/event-stream")
                .contentType(ContentType.JSON)
                .body(initRequest)
                .when()
                .post("/mcp")
                .then()
                .statusCode(200)
                .body("result.serverInfo.name", notNullValue())
                .extract();

        String sessionId = initResponse.header("Mcp-Session-Id");
        assertNotNull(sessionId, "Expected Mcp-Session-Id header in initialize response");

        // 2. Query available tools via MCP JSON-RPC with session ID
        Map<String, Object> listToolsRequest = Map.of(
                "jsonrpc", "2.0",
                "id", 2,
                "method", "tools/list",
                "params", Map.of()
        );

        given()
                .header("Accept", "application/json, text/event-stream")
                .header("Mcp-Session-Id", sessionId)
                .contentType(ContentType.JSON)
                .body(listToolsRequest)
                .when()
                .post("/mcp")
                .then()
                .statusCode(200)
                .body("result.tools.size()", greaterThan(10));
    }
}
