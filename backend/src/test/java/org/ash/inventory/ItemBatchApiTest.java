package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;

@QuarkusTest
class ItemBatchApiTest {
    @Test
    void batchCreatesItemsAndRegistersExplicitAssetCodes() {
        String tag = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        List<String> ids = request().body(Map.of("items", List.of(
                        Map.of("item", item("Batch bulk " + tag, "bulk", 4)),
                        Map.of("item", item("Batch serialized " + tag, "serialized", 0), "assetCodes", List.of("bt-" + tag + "-1", "BT-" + tag + "-2")))))
                .post("/api/items/batch").then().statusCode(200)
                .body("", hasSize(2))
                .body("[0].name", equalTo("Batch bulk " + tag))
                .body("[1].sku", matchesPattern("BATCHSER-[0-9A-F]{8}"))
                .extract().path("id");
        request().get("/api/items/" + ids.get(1) + "/assets").then().statusCode(200)
                .body("assetCode", containsInAnyOrder("BT-" + tag + "-1", "BT-" + tag + "-2"));
    }

    @Test
    void batchIsAllOrNothingAndNamesTheFailingEntry() {
        String tag = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        String existing = request().body(Map.of("items", List.of(Map.of("item", item("Batch owner " + tag, "serialized", 0),
                        "assetCodes", List.of("DUP-" + tag)))))
                .post("/api/items/batch").then().statusCode(200).extract().path("[0].id");
        request().body(Map.of("items", List.of(
                        Map.of("item", item("Batch rolled back " + tag, "bulk", 1)),
                        Map.of("item", item("Batch conflict " + tag, "serialized", 0), "assetCodes", List.of("dup-" + tag)))))
                .post("/api/items/batch").then().statusCode(409)
                .body("details.index", equalTo(1));
        request().queryParam("search", "Batch rolled back " + tag).get("/api/items").then().statusCode(200).body("", hasSize(0));
        request().get("/api/items/" + existing + "/assets").then().statusCode(200).body("", hasSize(1));
    }

    @Test
    void batchUpdatesKeepTheSkuAndSkipKnownAssetCodes() {
        String tag = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        Map<String, Object> created = request().body(Map.of("items", List.of(Map.of("item", item("Batch update " + tag, "serialized", 0),
                        "assetCodes", List.of("UPD-" + tag + "-1")))))
                .post("/api/items/batch").then().statusCode(200).extract().path("[0]");
        var update = new java.util.HashMap<>(item("Batch update renamed " + tag, "serialized", 0));
        update.remove("amount");
        request().body(Map.of("items", List.of(Map.of("id", created.get("id"), "item", update,
                        "assetCodes", List.of("UPD-" + tag + "-1", "UPD-" + tag + "-2")))))
                .post("/api/items/batch").then().statusCode(200)
                .body("[0].name", equalTo("Batch update renamed " + tag))
                .body("[0].sku", equalTo(created.get("sku")));
        request().get("/api/items/" + created.get("id") + "/assets").then().statusCode(200)
                .body("assetCode", containsInAnyOrder("UPD-" + tag + "-1", "UPD-" + tag + "-2"));
    }

    @Test
    void duplicateExplicitSkuIsAConflict() {
        String sku = "DUP-SKU-" + UUID.randomUUID();
        request().body(Map.of("sku", sku, "name", "First SKU owner", "category", "Batch", "privateResource", false))
                .post("/api/items").then().statusCode(200);
        request().body(Map.of("sku", sku.toLowerCase(), "name", "Second SKU owner", "category", "Batch", "privateResource", false))
                .post("/api/items").then().statusCode(409);
    }

    @Test
    void patchWithoutSkuKeepsTheGeneratedSku() {
        Map<String, Object> created = request().body(Map.of("name", "Stable SKU " + UUID.randomUUID(), "category", "Batch", "privateResource", false))
                .post("/api/items").then().statusCode(200).extract().path("");
        request().body(Map.of("name", "Stable SKU renamed", "category", "Batch"))
                .patch("/api/items/" + created.get("id")).then().statusCode(200)
                .body("sku", equalTo(created.get("sku")));
    }

    @Test
    void batchRejectsMoreThanOneHundredEntries() {
        var entries = java.util.stream.IntStream.range(0, 101).mapToObj(i -> Map.of("item", item("Too many " + i, "bulk", 0))).toList();
        request().body(Map.of("items", entries)).post("/api/items/batch").then().statusCode(400);
    }

    @Test
    void itemNamesAreUniquePerStorageLocationIgnoringCaseAndSpacing() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String shelf = TestLocations.section(ItemBatchApiTest::request, Map.of("name", "Name shelf " + tag));
        String other = TestLocations.section(ItemBatchApiTest::request, Map.of("name", "Name other " + tag));
        String first = request().body(item("Unique tent " + tag, shelf)).post("/api/items").then().statusCode(200).extract().path("id");
        request().body(item("  unique   TENT " + tag + " ", shelf)).post("/api/items").then().statusCode(409);
        // Another location may hold an item of the same name.
        String elsewhere = request().body(item("Unique tent " + tag, other)).post("/api/items").then().statusCode(200).extract().path("id");
        request().queryParam("storageLocation", shelf).get("/api/item-names").then().statusCode(200).body("", hasItem("Unique tent " + tag));
        request().queryParam("storageLocation", other).get("/api/item-names").then().statusCode(200).body("", hasSize(1));
        String second = request().body(item("Unique stove " + tag, shelf)).post("/api/items").then().statusCode(200).extract().path("id");
        request().body(edit("Unique Tent " + tag, shelf)).patch("/api/items/" + second).then().statusCode(409);
        // Moving into a location that already holds the name conflicts as well.
        request().body(edit("Unique tent " + tag, shelf)).patch("/api/items/" + elsewhere).then().statusCode(409);
        // Keeping (or re-casing) an item's own name at its location is never a conflict.
        request().body(edit("Unique Tent " + tag, shelf)).patch("/api/items/" + first).then().statusCode(200).body("name", equalTo("Unique Tent " + tag));
        request().delete("/api/items/" + first).then().statusCode(204);
        request().body(edit("Unique Tent " + tag, shelf)).patch("/api/items/" + second).then().statusCode(200);
    }

    private static Map<String, Object> item(String name, String location) {
        var input = new java.util.HashMap<>(item(name, "bulk", 1));
        input.put("storageLocation", location);
        return input;
    }

    private static Map<String, Object> edit(String name, String location) {
        var input = new java.util.HashMap<>(item(name, location));
        input.remove("amount");
        return input;
    }

    private static Map<String, Object> item(String name, String trackingMode, int amount) {
        return Map.of("name", name, "category", "Batch", "trackingMode", trackingMode, "amount", amount, "privateResource", false);
    }

    private static io.restassured.specification.RequestSpecification request() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "batch-admin")
                .header("X-Actor-Name", "Batch Admin")
                .header("X-Actor-Role", "admin");
    }
}
