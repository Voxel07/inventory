package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class PrivateInventoryApiTest {
    private RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "privacy-" + name).header("X-Actor-Name", "privacy-" + name).header("X-Actor-Role", role);
    }
    private RequestSpecification owner() { return actor("owner", "faction_leader"); }
    private RequestSpecification reader() { return actor("reader", "read_only"); }
    private RequestSpecification admin() { return actor("admin", "admin"); }
    private String person(String name) {
        actor(name, "read_only").get("/api/access/people").then().statusCode(200);
        return admin().get("/api/access/people").then().statusCode(200).extract().jsonPath()
                .getString("find { it.name == 'privacy-" + name + "' }.id");
    }
    private Map<String, Object> itemInput() {
        return new HashMap<>(Map.of("sku", "PRIV-" + UUID.randomUUID(), "name", "Private radio", "category", "Secret-" + UUID.randomUUID(), "amount", 2, "minStock", 0, "value", 0));
    }
    /** Item edits never carry stock; the opening amount is create-only. */
    private Map<String, Object> editInput() {
        var input = itemInput(); input.remove("amount"); return input;
    }
    private String item() { return owner().body(itemInput()).post("/api/items").then().statusCode(200).body("access.privateResource", equalTo(true)).extract().path("id"); }
    private Map<String, Object> shares(int revision, List<?> grants) { return Map.of("revision", revision, "grants", grants, "reason", "Regression sharing change"); }
    private String policy(String kind, String id) { return "/api/access/" + kind + "/" + id; }

    @Test void privateDefaultsHideCatalogHistoryAndCategoriesFromOutsidersAndWarehouseStaff() {
        var publicInput = itemInput(); publicInput.put("privateResource", false);
        owner().body(publicInput).post("/api/items").then().statusCode(403);
        owner().body(Map.of("name", "Attempt public location", "privateResource", false)).post("/api/storage-locations").then().statusCode(403);
        String item = item();
        for (var request : List.of(reader(), actor("warehouse", "warehouse_crew"))) {
            request.get("/api/items/" + item).then().statusCode(404);
            request.get("/api/items").then().statusCode(200).body("id", not(hasItem(item)));
        }
        reader().get(policy("items", item)).then().statusCode(404);
        owner().get("/api/items/" + item).then().statusCode(200).header("Cache-Control", containsString("no-store")).header("X-Private-Inventory", equalTo("true"));
        admin().get("/api/items/" + item).then().statusCode(200).body("access.canManage", equalTo(true));
    }

    @Test void readOnlyMembersCannotAddItemsAssembliesOrLocationsEvenPrivately() {
        // A component the reader can see, so the creation ban (403) is tested rather than a hidden reference (404).
        var publicInput = new HashMap<>(itemInput()); publicInput.put("privateResource", false);
        String component = admin().body(publicInput).post("/api/items").then().statusCode(200).extract().path("id");
        reader().body(itemInput()).post("/api/items").then().statusCode(403);
        reader().body(Map.of("name", "Read-only shed " + UUID.randomUUID())).post("/api/storage-locations").then().statusCode(403);
        reader().body(Map.of("name", "Read-only kit " + UUID.randomUUID(), "itemQuantities", Map.of(component, 1))).post("/api/assemblies").then().statusCode(403);
        tenant("creator").body(Map.of("name", "Tenant shed " + UUID.randomUUID())).post("/api/storage-locations").then().statusCode(200).body("access.privateResource", equalTo(true));
    }

    @Test void personSharingDistinguishesViewEditAndManagementAndRevokesImmediately() {
        String readerId = person("reader"), item = item();
        owner().body(shares(0, List.of(Map.of("userId", readerId, "canEdit", false)))).put(policy("items", item)).then().statusCode(200).body("revision", equalTo(1));
        reader().get("/api/items/" + item).then().statusCode(200).body("access.canEdit", equalTo(false)).body("access.canManage", equalTo(false)).body("access.grants", empty());
        reader().body(editInput()).patch("/api/items/" + item).then().statusCode(404);
        reader().body(shares(1, List.of())).put(policy("items", item)).then().statusCode(anyOf(is(403), is(404)));
        owner().body(shares(0, List.of())).put(policy("items", item)).then().statusCode(409);
        owner().body(shares(1, List.of(Map.of("userId", readerId, "canEdit", true)))).put(policy("items", item)).then().statusCode(200);
        reader().body(editInput()).patch("/api/items/" + item).then().statusCode(200);
        reader().body(shares(2, List.of())).put(policy("items", item)).then().statusCode(403);
        owner().body(shares(2, List.of())).put(policy("items", item)).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(404);
        reader().body(editInput()).patch("/api/items/" + item).then().statusCode(404);
    }

    @Test void groupMembershipRevocationAndRevisionChecksApplyWithoutRoleEscalation() {
        String readerId = person("reader"), item = item(), name = "Private team " + UUID.randomUUID();
        var groupBody = Map.of("name", name, "revision", 0, "memberIds", List.of(readerId), "reason", "Create sharing team", "adminManaged", true);
        owner().body(groupBody).post("/api/access/groups").then().statusCode(403);
        // Read-only accounts own nothing to share: they join groups but never create them.
        reader().body(Map.of("name", "Reader team " + UUID.randomUUID(), "revision", 0, "memberIds", List.of(), "reason", "Not allowed"))
                .post("/api/access/groups").then().statusCode(403);
        String group = admin().body(groupBody).post("/api/access/groups").then().statusCode(200).body("ownerId", nullValue()).extract().path("id");
        reader().body(Map.of("name", name, "revision", 1, "memberIds", List.of(), "reason", "Members cannot edit HQ groups")).patch("/api/access/groups/" + group).then().statusCode(403);
        owner().body(shares(0, List.of(Map.of("groupId", group, "canEdit", true)))).put(policy("items", item)).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(200).body("access.canEdit", equalTo(true)).body("access.sources.kind", hasItem("group"));
        reader().get("/api/access/groups").then().statusCode(200).body("find { it.id == '" + group + "' }.memberIds", empty());
        admin().body(Map.of("name", name, "revision", 0, "memberIds", List.of(), "reason", "Stale edit")).patch("/api/access/groups/" + group).then().statusCode(409);
        admin().body(Map.of("name", name, "revision", 1, "memberIds", List.of(), "reason", "Remove membership")).patch("/api/access/groups/" + group).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(404);
        reader().body(editInput()).patch("/api/items/" + item).then().statusCode(404);
    }

    @Test void sharingAnItemDoesNotShareItsPrivateWhereaboutsAndLocationSharesCanBeRevoked() {
        String readerId = person("reader");
        String location = TestLocations.section(() -> owner(), Map.of("name", "Secret garage " + UUID.randomUUID()));
        var input = itemInput(); input.put("storageLocation", location); input.put("positionDetails", "Private shelf");
        String item = owner().body(input).post("/api/items").then().statusCode(200).extract().path("id");
        owner().body(shares(0, List.of(Map.of("userId", readerId, "canEdit", false)))).put(policy("items", item)).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(200).body("locationRestricted", equalTo(true)).body("storageLocation", nullValue()).body("positionDetails", nullValue());
        reader().get("/api/storage-locations").then().statusCode(200).body("id", not(hasItem(location)));
        owner().body(shares(0, List.of(Map.of("userId", readerId, "canEdit", false)))).put(policy("storage-locations", location)).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(200).body("locationRestricted", equalTo(false)).body("storageLocation", equalTo(location));
        owner().body(shares(1, List.of())).put(policy("storage-locations", location)).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(200).body("locationRestricted", equalTo(true));
    }

    @Test void mediaRequiresUploaderOwnershipAndCurrentItemAccessEvenWithKnownKeys() {
        String readerId = person("reader");
        String key = given().header("X-Actor-Id", "privacy-owner").header("X-Actor-Role", "faction_leader")
                .multiPart("file", "private.png", new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0}, "image/png").post("/api/media").then().statusCode(200).extract().path("key");
        reader().get("/api/media/" + key).then().statusCode(404);
        var input = itemInput(); input.put("images", List.of(key));
        String item = owner().body(input).post("/api/items").then().statusCode(200).extract().path("id");
        String attached = owner().get("/api/items/" + item).then().statusCode(200).extract().path("images[0]");
        owner().get("/api/media/" + attached).then().statusCode(200).header("Cache-Control", containsString("no-store"));
        reader().get("/api/media/" + attached).then().statusCode(404);
        owner().body(shares(0, List.of(Map.of("userId", readerId, "canEdit", false)))).put(policy("items", item)).then().statusCode(200);
        reader().get("/api/media/" + attached).then().statusCode(200);
        owner().body(shares(1, List.of())).put(policy("items", item)).then().statusCode(200);
        reader().get("/api/media/" + attached).then().statusCode(404);
    }

    @Test void invalidDuplicateSharesAndNonAdminOwnershipTransfersAreRejected() {
        String readerId = person("reader"), item = item();
        var grant = Map.of("userId", readerId, "canEdit", false);
        owner().body(shares(0, List.of(grant, grant))).put(policy("items", item)).then().statusCode(400);
        owner().body(shares(0, List.of(Map.of("canEdit", true)))).put(policy("items", item)).then().statusCode(400);
        owner().body(Map.of("revision", 0, "grants", List.of(), "ownerId", readerId, "reason", "Attempt ownership transfer")).put(policy("items", item)).then().statusCode(403);
        owner().get(policy("items", item)).then().statusCode(200).body("revision", equalTo(0));
    }

    @Test void historyAndCachedReportsDoNotRevealPrivateInventoryToWarehouseStaff() {
        String item = item();
        actor("warehouse", "warehouse_crew").get("/api/transactions").then().statusCode(200).body("itemId", not(hasItem(item)));
        admin().body(Map.of()).post("/api/reports/availability/rebuild").then().statusCode(204);
        admin().queryParam("itemId", item).get("/api/reports/availability").then().statusCode(200).body("total", greaterThan(0));
        actor("warehouse", "warehouse_crew").queryParam("itemId", item).get("/api/reports/availability").then().statusCode(200).body("total", equalTo(0)).body("rows", empty());
        String warehouseId = actor("warehouse", "warehouse_crew").get("/api/access/people").then().extract().jsonPath().getString("find { it.name == 'privacy-warehouse' }.id");
        owner().body(shares(0, List.of(Map.of("userId", warehouseId, "canEdit", false)))).put(policy("items", item)).then().statusCode(200);
        actor("warehouse", "warehouse_crew").queryParam("itemId", item).get("/api/reports/availability").then().statusCode(200).body("total", greaterThan(0));
        owner().body(shares(1, List.of())).put(policy("items", item)).then().statusCode(200);
        actor("warehouse", "warehouse_crew").queryParam("itemId", item).get("/api/reports/availability").then().statusCode(200).body("total", equalTo(0));
    }

    @Test void concurrentEditsAndGroupRevocationCompleteAndSubsequentEditsAreDenied() throws Exception {
        String readerId = person("reader"), item = item(), name = "Concurrent team " + UUID.randomUUID();
        String group = admin().body(Map.of("name", name, "revision", 0, "memberIds", List.of(readerId), "reason", "Create concurrent team", "adminManaged", true))
                .post("/api/access/groups").then().statusCode(200).extract().path("id");
        owner().body(shares(0, List.of(Map.of("groupId", group, "canEdit", true)))).put(policy("items", item)).then().statusCode(200);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var edit = executor.submit(() -> { start.await(); return reader().body(editInput()).patch("/api/items/" + item).statusCode(); });
            var revoke = executor.submit(() -> { start.await(); return admin().body(Map.of("name", name, "revision", 1, "memberIds", List.of(), "reason", "Concurrent revocation")).patch("/api/access/groups/" + group).statusCode(); });
            start.countDown();
            assertEquals(200, revoke.get(15, TimeUnit.SECONDS));
            assertTrue(Set.of(200, 404).contains(edit.get(15, TimeUnit.SECONDS)), "An edit may finish before revocation or be denied after it");
        }
        reader().body(editInput()).patch("/api/items/" + item).then().statusCode(404);
        reader().header("If-None-Match", "*").get("/api/items/" + item).then().statusCode(404);
    }

    private RequestSpecification tenant(String name) { return actor(name, "tenant"); }
    private String building(RequestSpecification owner, String parent) {
        var body = new HashMap<String, Object>(Map.of("name", "Rented building " + UUID.randomUUID()));
        if (parent != null) body.put("parentLocationId", parent);
        return owner.body(body).post("/api/storage-locations").then().statusCode(200).extract().path("id");
    }

    @Test void sharingABuildingWithAGroupSharesTheItemsAndSubLocationsStoredThere() {
        String guestId = person("guest");
        String hall = building(tenant("landlord"), null), room = building(tenant("landlord"), hall);
        var input = itemInput(); input.put("storageLocation", room);
        String stored = tenant("landlord").body(input).post("/api/items").then().statusCode(200).extract().path("id");
        String elsewhere = item();
        actor("guest", "read_only").get("/api/items/" + stored).then().statusCode(404);

        // A tenant creates their own share group and shares the building with it.
        String group = tenant("landlord").body(Map.of("name", "Building crew " + UUID.randomUUID(), "revision", 0, "memberIds", List.of(guestId), "reason", "People allowed into my building"))
                .post("/api/access/groups").then().statusCode(200).body("canManage", equalTo(true)).extract().path("id");
        tenant("landlord").body(shares(0, List.of(Map.of("groupId", group, "canEdit", false)))).put(policy("storage-locations", hall)).then().statusCode(200);
        actor("guest", "read_only").get("/api/items/" + stored).then().statusCode(200)
                .body("access.canEdit", equalTo(false)).body("access.sources.kind", hasItem("location"));
        actor("guest", "read_only").get("/api/storage-locations").then().statusCode(200).body("id", hasItems(hall, room));
        actor("guest", "read_only").get("/api/items/" + elsewhere).then().statusCode(404);
        actor("guest", "read_only").body(editInput()).patch("/api/items/" + stored).then().statusCode(404);
        tenant("landlord").get(policy("items", stored)).then().statusCode(200).body("inherited.kind", hasItem("group"));

        // Moving the item out of the building ends the inherited access.
        tenant("landlord").body(editInput()).patch("/api/items/" + stored).then().statusCode(200);
        actor("guest", "read_only").get("/api/items/" + stored).then().statusCode(404);

        // Other users neither see nor use the tenant's private group; deleting it revokes its shares.
        owner().get("/api/access/groups").then().statusCode(200).body("id", not(hasItem(group)));
        owner().body(shares(0, List.of(Map.of("groupId", group, "canEdit", false)))).put(policy("items", elsewhere)).then().statusCode(400);
        owner().body(Map.of("revision", 1, "reason", "Not mine")).post("/api/access/groups/" + group + "/delete").then().statusCode(404);
        tenant("landlord").body(Map.of("revision", 1, "reason", "Lease ended")).post("/api/access/groups/" + group + "/delete").then().statusCode(204);
        actor("guest", "read_only").get("/api/storage-locations").then().statusCode(200).body("id", not(hasItem(hall)));
    }

    @Test void buildingOwnersManageWhatOthersStoreInTheirBuildingButNotItsSharing() {
        String lodgerId = person("lodger");
        // Stock is kept in a section of the building, never in the top-level location itself.
        String hall = building(tenant("host"), building(tenant("host"), null));
        tenant("host").body(shares(0, List.of(Map.of("userId", lodgerId, "canEdit", true)))).put(policy("storage-locations", hall)).then().statusCode(200);
        var input = itemInput(); input.put("storageLocation", hall);
        String lodgerItem = actor("lodger", "faction_leader").body(input).post("/api/items").then().statusCode(200).extract().path("id");
        tenant("host").get("/api/items/" + lodgerItem).then().statusCode(200).body("access.canEdit", equalTo(true)).body("access.canManage", equalTo(false));
        var edit = editInput(); edit.put("storageLocation", hall);
        tenant("host").body(edit).patch("/api/items/" + lodgerItem).then().statusCode(200);
        tenant("host").body(shares(0, List.of())).put(policy("items", lodgerItem)).then().statusCode(403);
        // Sub-locations of a private building must stay private.
        admin().body(Map.of("name", "Public room", "privateResource", false, "parentLocationId", hall)).post("/api/storage-locations").then().statusCode(400);
    }

    @Test void itemsOfferedForUseAreVisibleToOrganizationMembersAndNotifyTheOwnerOnce() {
        String item = tenant("lender").body(itemInput()).post("/api/items").then().statusCode(200).extract().path("id");
        actor("borrower", "faction_leader").get("/api/items/" + item).then().statusCode(404);
        tenant("lender").body(Map.of("revision", 0, "grants", List.of(), "reason", "Available for events", "publicUse", true))
                .put(policy("items", item)).then().statusCode(200).body("publicUse", equalTo(true));
        actor("borrower", "faction_leader").get("/api/items/" + item).then().statusCode(200)
                .body("access.canEdit", equalTo(false)).body("access.sources.kind", hasItem("public_use"));
        actor("borrower", "faction_leader").body(editInput()).patch("/api/items/" + item).then().statusCode(404);
        tenant("other-tenant").get("/api/items/" + item).then().statusCode(404);

        admin().body(Map.of("eventType", "DE", "startDate", "2043-06-01")).post("/api/events").then().statusCode(200);
        admin().body(Map.of("eventType", "DE", "name", "Offer test")).post("/api/factions").then().statusCode(200);
        var leader = actor("borrower", "faction_leader").header("X-Actor-Factions", "DE:offer-test");
        String order = leader.body(Map.of("eventType", "DE", "faction", "Offer test", "eventDate", "2043-06-01",
                        "requestedQuantities", Map.of(item, 1), "requestedAssemblyQuantities", Map.of()))
                .post("/api/orders/faction").then().statusCode(200).extract().path("id");
        for (String target : List.of("submitted", "draft", "submitted"))
            actor("borrower", "faction_leader").header("X-Actor-Factions", "DE:offer-test").body(Map.of("idempotencyKey", UUID.randomUUID()))
                    .post("/api/orders/faction/" + order + "/transitions/" + target).then().statusCode(200);
        tenant("lender").get("/api/notifications").then().statusCode(200)
                .body("findAll { it.type == 'item_requested' }.size()", equalTo(1))
                .body("find { it.type == 'item_requested' }.payload.itemId", equalTo(item))
                .body("find { it.type == 'item_requested' }.payload.path", equalTo("/items/" + item))
                .body("find { it.type == 'item_requested' }.factionOrderId", nullValue());
    }
}
