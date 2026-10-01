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
    private RequestSpecification owner() { return actor("owner", "read_only"); }
    private RequestSpecification reader() { return actor("reader", "read_only"); }
    private RequestSpecification admin() { return actor("admin", "hq_admin"); }
    private String person(String name) {
        actor(name, "read_only").get("/api/access/people").then().statusCode(200);
        return admin().get("/api/access/people").then().statusCode(200).extract().jsonPath()
                .getString("find { it.name == 'privacy-" + name + "' }.id");
    }
    private Map<String, Object> itemInput() {
        return new HashMap<>(Map.of("sku", "PRIV-" + UUID.randomUUID(), "name", "Private radio", "category", "Secret-" + UUID.randomUUID(), "amount", 2, "minStock", 0, "value", 0));
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

    @Test void personSharingDistinguishesViewEditAndManagementAndRevokesImmediately() {
        String readerId = person("reader"), item = item();
        owner().body(shares(0, List.of(Map.of("userId", readerId, "canEdit", false)))).put(policy("items", item)).then().statusCode(200).body("revision", equalTo(1));
        reader().get("/api/items/" + item).then().statusCode(200).body("access.canEdit", equalTo(false)).body("access.canManage", equalTo(false)).body("access.grants", empty());
        reader().body(itemInput()).patch("/api/items/" + item).then().statusCode(404);
        reader().body(shares(1, List.of())).put(policy("items", item)).then().statusCode(anyOf(is(403), is(404)));
        owner().body(shares(0, List.of())).put(policy("items", item)).then().statusCode(409);
        owner().body(shares(1, List.of(Map.of("userId", readerId, "canEdit", true)))).put(policy("items", item)).then().statusCode(200);
        reader().body(itemInput()).patch("/api/items/" + item).then().statusCode(200);
        reader().body(shares(2, List.of())).put(policy("items", item)).then().statusCode(403);
        owner().body(shares(2, List.of())).put(policy("items", item)).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(404);
        reader().body(itemInput()).patch("/api/items/" + item).then().statusCode(404);
    }

    @Test void groupMembershipRevocationAndRevisionChecksApplyWithoutRoleEscalation() {
        String readerId = person("reader"), item = item(), name = "Private team " + UUID.randomUUID();
        var groupBody = Map.of("name", name, "revision", 0, "memberIds", List.of(readerId), "reason", "Create sharing team");
        owner().body(groupBody).post("/api/access/groups").then().statusCode(403);
        String group = admin().body(groupBody).post("/api/access/groups").then().statusCode(200).extract().path("id");
        owner().body(shares(0, List.of(Map.of("groupId", group, "canEdit", true)))).put(policy("items", item)).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(200).body("access.canEdit", equalTo(true)).body("access.sources.kind", hasItem("group"));
        reader().get("/api/access/groups").then().statusCode(200).body("find { it.id == '" + group + "' }.memberIds", empty());
        admin().body(Map.of("name", name, "revision", 0, "memberIds", List.of(), "reason", "Stale edit")).patch("/api/access/groups/" + group).then().statusCode(409);
        admin().body(Map.of("name", name, "revision", 1, "memberIds", List.of(), "reason", "Remove membership")).patch("/api/access/groups/" + group).then().statusCode(200);
        reader().get("/api/items/" + item).then().statusCode(404);
        reader().body(itemInput()).patch("/api/items/" + item).then().statusCode(404);
    }

    @Test void sharingAnItemDoesNotShareItsPrivateWhereaboutsAndLocationSharesCanBeRevoked() {
        String readerId = person("reader");
        String location = owner().body(Map.of("name", "Secret garage " + UUID.randomUUID())).post("/api/storage-locations").then().statusCode(200).extract().path("id");
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
        String key = given().header("X-Actor-Id", "privacy-owner").header("X-Actor-Role", "read_only")
                .multiPart("file", "private.png", new byte[]{1, 2, 3}, "image/png").post("/api/media").then().statusCode(200).extract().path("key");
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

    @Test void codesHistoryAndCachedReportsDoNotRevealPrivateInventoryToWarehouseStaff() {
        String item = item(), code = "PRIV-" + UUID.randomUUID();
        owner().body(Map.of("code", code, "targetType", "product", "targetId", item, "primaryCode", true))
                .post("/api/inventory-codes").then().statusCode(201);
        owner().get("/api/inventory-codes/resolve/" + code).then().statusCode(200).body("targetId", equalTo(item));
        actor("warehouse", "warehouse_crew").get("/api/inventory-codes/resolve/" + code).then().statusCode(404);
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
        String group = admin().body(Map.of("name", name, "revision", 0, "memberIds", List.of(readerId), "reason", "Create concurrent team"))
                .post("/api/access/groups").then().statusCode(200).extract().path("id");
        owner().body(shares(0, List.of(Map.of("groupId", group, "canEdit", true)))).put(policy("items", item)).then().statusCode(200);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var edit = executor.submit(() -> { start.await(); return reader().body(itemInput()).patch("/api/items/" + item).statusCode(); });
            var revoke = executor.submit(() -> { start.await(); return admin().body(Map.of("name", name, "revision", 1, "memberIds", List.of(), "reason", "Concurrent revocation")).patch("/api/access/groups/" + group).statusCode(); });
            start.countDown();
            assertEquals(200, revoke.get(15, TimeUnit.SECONDS));
            assertTrue(Set.of(200, 404).contains(edit.get(15, TimeUnit.SECONDS)), "An edit may finish before revocation or be denied after it");
        }
        reader().body(itemInput()).patch("/api/items/" + item).then().statusCode(404);
        reader().header("If-None-Match", "*").get("/api/items/" + item).then().statusCode(404);
    }
}
