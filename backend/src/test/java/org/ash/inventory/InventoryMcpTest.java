package org.ash.inventory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkiverse.mcp.server.ToolCallException;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.mcp.InventoryMcpPrompts;
import org.ash.inventory.mcp.InventoryMcpResources;
import org.ash.inventory.mcp.InventoryMcpTools;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiModels;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.greaterThan;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class InventoryMcpTest {
    @Inject EntityManager em;
    @Inject ObjectMapper mapper;
    @Inject InventoryMcpTools tools;
    @Inject InventoryMcpResources resources;
    @Inject InventoryMcpPrompts prompts;

    private Item bulk;
    private Item serialized;
    private Item privateItem;
    private Item groupItem;
    private StorageLocation location;
    private AssetInstance asset;
    private UserAccount owner;
    private UUID privateAssemblyId;
    private EventOccurrence event;

    @BeforeEach
    void setupTestData() {
        QuarkusTransaction.requiringNew().run(() -> {
            location = new StorageLocation();
            location.name = "MCP Armory " + UUID.randomUUID();
            location.locationType = DomainEnums.LocationType.warehouse;
            em.persist(location);
            bulk = item("MCP Bulk", DomainEnums.TrackingMode.bulk);
            bulk.baseAmount = 10;
            bulk.minStock = 5;
            em.persist(bulk);
            var position = new InventoryPosition();
            position.item = bulk;
            position.location = location;
            position.quantityOnHand = 10;
            position.quantityReserved = 1;
            em.persist(position);
            serialized = item("MCP Radio", DomainEnums.TrackingMode.serialized);
            serialized.minStock = 5;
            em.persist(serialized);
            asset = asset(serialized);
            owner = new UserAccount();
            owner.issuer = "dev";
            owner.externalSubject = "mcp-owner-" + UUID.randomUUID();
            owner.name = "MCP private owner";
            owner.role = DomainEnums.UserRole.faction_leader;
            owner.factions = List.of("mcp-group-" + UUID.randomUUID());
            em.persist(owner);
            privateItem = item("MCP private radio", DomainEnums.TrackingMode.serialized);
            privateItem.category = "MCP private category " + UUID.randomUUID();
            privateItem.visibilityScope = DomainEnums.ItemVisibilityScope.person;
            privateItem.assignedUser = owner;
            em.persist(privateItem);
            asset(privateItem);
            groupItem = item("MCP group radio", DomainEnums.TrackingMode.serialized);
            groupItem.visibilityScope = DomainEnums.ItemVisibilityScope.group;
            groupItem.assignedGroup = owner.factions.getFirst();
            em.persist(groupItem);
            asset(groupItem);
            var assembly = new Assembly();
            assembly.name = "MCP mixed kit " + UUID.randomUUID();
            em.persist(assembly);
            var component = new AssemblyItem();
            component.assembly = assembly;
            component.item = privateItem;
            component.id = new AssemblyItemId(assembly.id, privateItem.id);
            component.quantity = 1;
            em.persist(component);
            privateAssemblyId = assembly.id;
            event = new EventOccurrence();
            event.name = "MCP event " + UUID.randomUUID();
            event.eventType = "MILSIM";
            event.startDate = LocalDate.now().plusDays(7);
            event.endDate = event.startDate.plusDays(2);
            event.plannedQuantities = Map.of(privateItem.id.toString(), 4, bulk.id.toString(), 2);
            em.persist(event);
        });
    }

    private Item item(String name, DomainEnums.TrackingMode tracking) {
        var item = new Item();
        item.name = name;
        item.sku = "MCP-" + UUID.randomUUID();
        item.category = "Communications";
        item.storageLocation = location;
        item.trackingMode = tracking;
        return item;
    }

    private AssetInstance asset(Item item) {
        var value = new AssetInstance();
        value.item = item;
        value.assetCode = "AST-MCP-" + UUID.randomUUID();
        value.currentLocation = location;
        em.persist(value);
        return value;
    }

    private ApiModels.ItemInput itemInput(String name, int amount, String tracking) {
        return mapper.convertValue(Map.of("name", name, "category", "Optics", "amount", amount,
                "minStock", 2, "value", 3500, "trackingMode", tracking,
                "storageLocation", location.id.toString()), ApiModels.ItemInput.class);
    }

    @Test
    void itemCommandsUseLedgerAssetsRealActorAndOutbox() {
        var created = tools.create_item(itemInput("MCP NVG " + UUID.randomUUID(), 4, "serialized"));
        assertEquals(4, created.stock().onHand());
        assertEquals(4, created.stock().available());
        assertEquals(4, tools.list_asset_instances(created.id(), null, null, null).size());
        assertTrue(tools.get_inventory_positions(created.id()).isEmpty());
        QuarkusTransaction.requiringNew().run(() -> {
            var tx = em.createQuery("from StockTransaction t join fetch t.user where t.item.id = :id", StockTransaction.class)
                    .setParameter("id", created.id()).getSingleResult();
            assertEquals("dev-hq-admin", tx.user.externalSubject);
            assertEquals(4, tx.quantity);
            var changed = em.createQuery("from DomainEvent e where e.aggregateId = :id and e.eventType = 'catalog.changed'", DomainEvent.class)
                    .setParameter("id", created.id()).getSingleResult();
            assertEquals(tx.user.id, changed.actorId);
            assertEquals(0L, em.createQuery("select count(p) from InventoryPosition p where p.item.id = :id", Long.class)
                    .setParameter("id", created.id()).getSingleResult());
        });
        assertTrue(tools.search_items(created.name(), "Optics", 10, 0).stream().anyMatch(i -> i.id().equals(created.id())));
        var updated = tools.update_item(created.id(), itemInput(created.name() + " updated", 4, "serialized"));
        assertEquals(created.name() + " updated", updated.name());
        assertTrue(tools.delete_item(created.id()).success());
        assertTrue(assertThrows(ToolCallException.class, () -> tools.get_item_details(created.id())).getMessage().startsWith("404:"));
    }

    @Test
    void unlocatedBulkCreationDoesNotPersistAnInvalidPosition() {
        var input = mapper.convertValue(Map.of("name", "MCP unlocated " + UUID.randomUUID(),
                "category", "Consumables", "amount", 3), ApiModels.ItemInput.class);
        var created = tools.create_item(input);
        assertEquals(3, created.stock().onHand());
        assertTrue(tools.get_inventory_positions(created.id()).isEmpty());
    }

    @Test
    void assemblyAndEventCommandsUseSharedContractsAndGuards() {
        var input = new ApiModels.AssemblyInput("MCP kit " + UUID.randomUUID(), "Comms kit", null,
                List.of("MILSIM"), Map.of(bulk.id, 2), null, false, null);
        var created = tools.create_assembly(input);
        assertEquals(2, created.itemQuantities().get(bulk.id.toString()));
        assertEquals(created.id(), tools.get_assembly_details(created.id()).id());
        assertTrue(tools.list_assemblies("MILSIM").stream().anyMatch(a -> a.id().equals(created.id())));
        var updated = tools.update_assembly(created.id(), new ApiModels.AssemblyInput(input.name(), "Updated", null,
                input.eventTypes(), Map.of(bulk.id, 4), null, false, null));
        assertEquals(4, updated.itemQuantities().get(bulk.id.toString()));
        assertTrue(tools.delete_assembly(created.id()).success());
        var eventInput = new ApiModels.EventInput("MILSIM", "MCP planned " + UUID.randomUUID(),
                LocalDate.now().plusDays(14), null, "planned", null, Map.of(bulk.id, 5), null);
        var createdEvent = tools.create_event(eventInput);
        assertEquals(5, createdEvent.plannedQuantities().get(bulk.id.toString()));
        assertEquals(eventInput.startDate(), tools.get_event_details(createdEvent.id()).startDate());
        assertEquals("active", tools.update_event(createdEvent.id(), new ApiModels.EventInput("MILSIM", eventInput.name(),
                eventInput.startDate(), null, "active", null, null, null)).status());
        assertTrue(tools.delete_event(createdEvent.id()).success());
    }

    @Test
    void invalidCommandsRollbackInsteadOfSilentlyCoercingQuantities() {
        assertTrue(assertThrows(ToolCallException.class, () -> tools.create_item(itemInput("Negative", -1, "bulk")))
                .getMessage().startsWith("400:"));
        assertThrows(ToolCallException.class, () -> tools.create_assembly(new ApiModels.AssemblyInput("Invalid kit", null,
                null, List.of(), Map.of(bulk.id, 0), null, false, null)));
        assertThrows(ToolCallException.class, () -> tools.update_item(bulk.id, itemInput(bulk.name, 11, "bulk")));
        assertEquals(10, tools.get_item_details(bulk.id).stock().onHand());
        assertThrows(ToolCallException.class, () -> tools.check_low_stock_items(-1));
    }

    @Test
    void eventDeletionRejectsPurchaseHistory() {
        QuarkusTransaction.requiringNew().run(() -> {
            var vendor = new Vendor();
            vendor.name = "MCP vendor " + UUID.randomUUID();
            em.persist(vendor);
            var purchase = new PurchaseOrder();
            purchase.orderNumber = "MCP-PO-" + UUID.randomUUID();
            purchase.vendor = vendor;
            purchase.orderDate = LocalDate.now();
            purchase.createdBy = em.find(UserAccount.class, owner.id);
            purchase.eventOccurrence = em.find(EventOccurrence.class, event.id);
            em.persist(purchase);
        });
        assertTrue(assertThrows(ToolCallException.class, () -> tools.delete_event(event.id)).getMessage().startsWith("409:"));
        assertEquals(event.id, tools.get_event_details(event.id).id());
    }

    @Test
    void serializedLowStockUsesAssetsAndHoldsUseCanonicalAvailability() {
        var alert = tools.check_low_stock_items(0).stream().filter(a -> a.itemId().equals(serialized.id)).findFirst().orElseThrow();
        assertEquals(1, alert.currentOnHand());
        assertEquals(1, alert.currentAvailable());
        assertEquals(4, alert.deficit());
        QuarkusTransaction.requiringNew().run(() -> em.find(Item.class, bulk.id).availabilityPolicy = Item.AvailabilityPolicy.unavailable);
        assertEquals(0, tools.get_inventory_positions(bulk.id).getFirst().availableQuantity());
        assertEquals(0, tools.get_item_details(bulk.id).stock().available());
    }

    @Test
    void positionsIncludePreparedReservationsAndWholePoolContributorHold() {
        QuarkusTransaction.requiringNew().run(() -> {
            var order = new GeneralOrder();
            order.name = "MCP reserved " + UUID.randomUUID();
            order.purpose = "Position availability regression";
            order.createdBy = em.find(UserAccount.class, owner.id);
            order.status = "ready";
            order.preparedQuantities = Map.of(bulk.id.toString(), 3);
            order.sourceLocations = Map.of(bulk.id.toString(), location.id.toString());
            em.persist(order);
        });
        var position = tools.get_inventory_positions(bulk.id).getFirst();
        assertEquals(4, position.quantityReserved());
        assertEquals(6, position.availableQuantity());
        QuarkusTransaction.requiringNew().run(() -> {
            var faction = new Faction();
            faction.name = "MCP faction " + UUID.randomUUID();
            faction.slug = UUID.randomUUID().toString();
            faction.eventType = "MILSIM";
            em.persist(faction);
            var order = new FactionOrder();
            order.orderCode = "MCP-ORDER-" + UUID.randomUUID();
            order.eventOccurrence = em.find(EventOccurrence.class, event.id);
            order.faction = faction;
            order.createdBy = em.find(UserAccount.class, owner.id);
            order.status = DomainEnums.OrderStatus.ready;
            em.persist(order);
            var line = new FactionOrderLine();
            line.order = order;
            line.item = em.find(Item.class, bulk.id);
            line.requestedQuantity = 3;
            em.persist(line);
            var reservation = new StockReservation();
            reservation.order = order;
            reservation.orderLine = line;
            reservation.item = line.item;
            reservation.location = em.find(StorageLocation.class, location.id);
            reservation.createdBy = order.createdBy;
            reservation.requestedQuantity = 3;
            reservation.reservedQuantity = 3;
            reservation.releasedQuantity = 1;
            reservation.status = DomainEnums.ReservationStatus.partially_released;
            em.persist(reservation);
        });
        assertEquals(6, tools.get_inventory_positions(bulk.id).getFirst().quantityReserved());
        assertEquals(4, tools.get_inventory_positions(bulk.id).getFirst().availableQuantity());
        QuarkusTransaction.requiringNew().run(() -> {
            var request = new MemberRequest();
            request.requester = em.find(UserAccount.class, owner.id);
            request.item = em.find(Item.class, bulk.id);
            request.kind = "damage";
            request.quantity = 1;
            request.notes = "Contributor safety evidence";
            request.commandId = UUID.randomUUID();
            em.persist(request);
        });
        assertEquals(0, tools.get_inventory_positions(bulk.id).getFirst().availableQuantity());
        assertEquals(0, tools.get_item_details(bulk.id).stock().available());
        var alert = tools.check_low_stock_items(0).stream().filter(a -> a.itemId().equals(bulk.id)).findFirst().orElseThrow();
        assertEquals(5, alert.deficit());
    }

    @Test
    void maintenanceSchedulesUseHoursAndUnknownEvidence() {
        UUID scheduleId = QuarkusTransaction.requiringNew().call(() -> {
            var schedule = new MaintenanceSchedule();
            schedule.item = em.find(Item.class, serialized.id);
            schedule.assetInstance = em.find(AssetInstance.class, asset.id);
            schedule.maintenanceType = DomainEnums.MaintenanceType.generator_service;
            schedule.intervalType = DomainEnums.MaintenanceIntervalType.operating_hours;
            schedule.intervalValue = BigDecimal.TEN;
            schedule.nextDueValue = BigDecimal.TEN;
            schedule.assetInstance.operatingHours = BigDecimal.TEN;
            em.persist(schedule);
            return schedule.id;
        });
        assertEquals("due", tools.get_maintenance_alerts().stream().filter(a -> a.entityId().equals(scheduleId)).findFirst().orElseThrow().status());
        assertEquals(0, tools.get_item_details(serialized.id).stock().available());
        QuarkusTransaction.requiringNew().run(() -> em.find(MaintenanceSchedule.class, scheduleId).nextDueValue = null);
        assertEquals("unknown", tools.get_maintenance_alerts().stream().filter(a -> a.entityId().equals(scheduleId)).findFirst().orElseThrow().status());
    }

    @Test
    void privateReadsNestedComponentsCategoriesAndEventMetricsAreScopedOverHttp() throws Exception {
        String actorId = "mcp-unrelated-" + UUID.randomUUID();
        String session = session(actorId, "read_only");
        for (String tool : List.of("get_item_details", "get_inventory_positions", "list_asset_instances")) {
            assertTrue(call(session, actorId, "read_only", tool, Map.of("itemId", privateItem.id.toString())).path("result").path("isError").asBoolean());
        }
        assertTrue(call(session, actorId, "read_only", "get_assembly_details", Map.of("assemblyId", privateAssemblyId.toString()))
                .path("result").path("isError").asBoolean());
        String search = call(session, actorId, "read_only", "search_items", Map.of("query", privateItem.sku)).toString();
        assertFalse(search.contains(privateItem.sku));
        assertTrue(call(session, actorId, "read_only", "get_item_details", Map.of("itemId", groupItem.id.toString()))
                .path("result").path("isError").asBoolean());
        assertFalse(call(session, actorId, "read_only", "search_items", Map.of("query", groupItem.sku)).toString().contains(groupItem.sku));
        assertFalse(call(session, actorId, "read_only", "list_assemblies", Map.of()).toString().contains(privateAssemblyId.toString()));
        assertFalse(call(session, actorId, "read_only", "get_event_details", Map.of("eventId", event.id.toString())).toString().contains(privateItem.id.toString()));
        var categories = rpc(session, actorId, "read_only", "resources/read", Map.of("uri", "inventory://categories"));
        assertFalse(categories.toString().contains(privateItem.category));
        String ownerSession = session(owner.externalSubject, "faction_leader");
        assertFalse(call(ownerSession, owner.externalSubject, "faction_leader", "get_item_details", Map.of("itemId", privateItem.id.toString()))
                .path("result").path("isError").asBoolean());
        assertFalse(call(ownerSession, owner.externalSubject, "faction_leader", "get_item_details", Map.of("itemId", groupItem.id.toString()))
                .path("result").path("isError").asBoolean());
    }

    @Test
    void managerAndPlannerPermissionsAreCheckedOnEachHttpCall() throws Exception {
        String actorId = "mcp-role-check-" + UUID.randomUUID();
        String session = session(actorId, "hq_admin");
        assertTrue(call(session, actorId, "read_only", "delete_item", Map.of("itemId", bulk.id.toString())).path("result").path("isError").asBoolean());
        assertTrue(call(session, actorId, "warehouse_crew", "delete_event", Map.of("eventId", event.id.toString())).path("result").path("isError").asBoolean());
        assertTrue(call(session, actorId, "event_planner", "delete_item", Map.of("itemId", bulk.id.toString())).path("result").path("isError").asBoolean());
        assertFalse(call(session, actorId, "warehouse_crew", "delete_item", Map.of("itemId", bulk.id.toString())).path("result").path("isError").asBoolean());
        assertFalse(call(session, actorId, "event_planner", "delete_event", Map.of("eventId", event.id.toString())).path("result").path("isError").asBoolean());
    }

    @Test
    void httpWriteAttributesActorAndInvalidationToTheCaller() throws Exception {
        String actorId = "mcp-writer-" + UUID.randomUUID();
        String name = "MCP HTTP created " + UUID.randomUUID();
        String session = session(actorId, "warehouse_crew");
        var response = call(session, actorId, "warehouse_crew", "create_item", Map.of("input", Map.of(
                "name", name, "category", "Optics", "amount", 2, "storageLocation", location.id.toString())));
        assertFalse(response.path("result").path("isError").asBoolean(), response.toString());
        QuarkusTransaction.requiringNew().run(() -> {
            var created = em.createQuery("from Item i where i.name = :name", Item.class).setParameter("name", name).getSingleResult();
            var tx = em.createQuery("from StockTransaction t join fetch t.user where t.item = :item", StockTransaction.class)
                    .setParameter("item", created).getSingleResult();
            assertEquals(actorId, tx.user.externalSubject);
            var changed = em.createQuery("from DomainEvent e where e.aggregateId = :id and e.eventType = 'catalog.changed'", DomainEvent.class)
                    .setParameter("id", created.id).getSingleResult();
            assertEquals(tx.user.id, changed.actorId);
        });
    }

    @Test
    void resourcesPromptsAndDiscoveryRemainAvailable() throws Exception {
        assertTrue(resources.systemOverview().text().contains("ASH Inventory"));
        assertNotNull(resources.locations());
        assertNotNull(resources.categories());
        assertTrue(prompts.eventReadinessAudit("Operation Alpha", "Comms").content().asText().text().contains("Operation Alpha"));
        assertNotNull(prompts.procurementRestockPlan(null));
        String session = session("mcp-discovery", "read_only");
        given().header("Accept", "application/json, text/event-stream").header("Mcp-Session-Id", session)
                .header("MCP-Protocol-Version", "2025-11-25")
                .contentType(ContentType.JSON).body(Map.of("jsonrpc", "2.0", "id", 2, "method", "tools/list", "params", Map.of()))
                .post("/mcp").then().statusCode(200).body("result.tools.size()", greaterThan(10));
    }

    private String session(String actorId, String role) {
        String session = given().header("Accept", "application/json, text/event-stream")
                .header("X-Actor-Id", actorId).header("X-Actor-Role", role).contentType(ContentType.JSON)
                .body(Map.of("jsonrpc", "2.0", "id", 1, "method", "initialize", "params", Map.of(
                        "protocolVersion", "2025-11-25", "capabilities", Map.of(), "clientInfo", Map.of("name", "test-client", "version", "1"))))
                .post("/mcp").then().statusCode(200).extract().header("Mcp-Session-Id");
        assertNotNull(session);
        given().header("Accept", "application/json, text/event-stream").header("Mcp-Session-Id", session)
                .header("MCP-Protocol-Version", "2025-11-25")
                .header("X-Actor-Id", actorId).header("X-Actor-Role", role).contentType(ContentType.JSON)
                .body(Map.of("jsonrpc", "2.0", "method", "notifications/initialized", "params", Map.of()))
                .post("/mcp").then().statusCode(202);
        return session;
    }

    private JsonNode call(String session, String actorId, String role, String tool, Map<String, Object> arguments) throws Exception {
        return rpc(session, actorId, role, "tools/call", Map.of("name", tool, "arguments", arguments));
    }

    private JsonNode rpc(String session, String actorId, String role, String method, Map<String, Object> params) throws Exception {
        String body = given().header("Accept", "application/json, text/event-stream").header("Mcp-Session-Id", session)
                .header("MCP-Protocol-Version", "2025-11-25").header("X-Actor-Id", actorId).header("X-Actor-Role", role)
                .contentType(ContentType.JSON).body(Map.of("jsonrpc", "2.0", "id", UUID.randomUUID().toString(), "method", method, "params", params))
                .post("/mcp").then().statusCode(200).extract().asString();
        var response = mapper.readTree(body);
        assertFalse(response.has("error"), body);
        assertTrue(response.path("result").isObject(), body);
        return response;
    }
}
