package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

/** Regressions for docs/ARCHITECTURE_CODE_QUALITY_AUDIT.md findings. */
@QuarkusTest
class AuditFixesApiTest {
    private static RequestSpecification admin() {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "audit-admin").header("X-Actor-Name", "audit-admin")
                .header("X-Actor-Role", "admin");
    }

    private static String serializedItem(int assets, Map<String, Object> extra) {
        var body = new HashMap<String, Object>(Map.of("sku", "AUD-" + UUID.randomUUID(), "name", "Audit item " + UUID.randomUUID(),
                "category", "Audit", "value", 0, "amount", assets, "trackingMode", "serialized"));
        body.putAll(extra);
        return admin().body(body).post("/api/items").then().statusCode(200).extract().path("id");
    }

    private static JsonPath assets(String item) {
        return admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().jsonPath();
    }

    private static Map<String, Object> checkout(String item, String asset) {
        return new HashMap<>(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 1,
                "reason", "Audit", "assetInstanceId", asset));
    }

    private static void condition(String item, String asset, String status) {
        long version = assets(item).getLong("find { it.id == '" + asset + "' }.version");
        admin().body(Map.of("conditionStatus", status, "expectedVersion", version))
                .post("/api/items/" + item + "/assets/" + asset + "/condition").then().statusCode(200);
    }

    @Test void conditionChangesKeepCustodyState() { // H01
        String item = serializedItem(1, Map.of());
        String asset = assets(item).getString("[0].id");
        admin().body(checkout(item, asset)).post("/api/transactions").then().statusCode(200);
        condition(item, asset, "damaged");
        admin().get("/api/items/" + item + "/assets").then().body("[0].availabilityStatus", equalTo("in_field"))
                .body("[0].conditionStatus", equalTo("damaged"));
        condition(item, asset, "good");
        admin().get("/api/items/" + item + "/assets").then().body("[0].availabilityStatus", equalTo("in_field"));
        var checkin = checkout(item, asset); checkin.put("transactionType", "checkin");
        admin().body(checkin).post("/api/transactions").then().statusCode(200);
        admin().get("/api/items/" + item + "/assets").then().body("[0].availabilityStatus", equalTo("available"));
    }

    @Test void conditionChangesMoveIdleAssetsBetweenAvailableAndDamaged() { // H01
        String item = serializedItem(1, Map.of());
        String asset = assets(item).getString("[0].id");
        condition(item, asset, "unsafe");
        admin().get("/api/items/" + item + "/assets").then().body("[0].availabilityStatus", equalTo("damaged"));
        condition(item, asset, "good");
        admin().get("/api/items/" + item + "/assets").then().body("[0].availabilityStatus", equalTo("available"));
    }

    @Test void assetInspectionIsScopedToThatAsset() { // H02
        String due = LocalDate.now().plusDays(200).toString();
        String item = serializedItem(2, Map.of());
        var list = assets(item);
        String first = list.getString("[0].id"), second = list.getString("[1].id");
        String firstSchedule = dateSchedule(item, first, due);
        String secondSchedule = dateSchedule(item, second, due);
        admin().body(Map.of("itemId", item, "assetInstanceId", first, "scheduleId", firstSchedule, "type", "dguv_v3", "result", "failed",
                "notes", "Insulation fault")).post("/api/maintenance").then().statusCode(200);
        admin().get("/api/items/" + item).then().statusCode(200)
                .body("maintenanceStatus", equalTo("certified")).body("nextMaintenanceDue", equalTo(due));
        admin().get("/api/items/" + item + "/assets").then()
                .body("find { it.id == '" + first + "' }.serviceStatus", equalTo("in_service"))
                .body("find { it.id == '" + first + "' }.availabilityStatus", equalTo("in_maintenance"))
                .body("find { it.id == '" + second + "' }.serviceStatus", equalTo("certified"));
        admin().body(checkout(item, first)).post("/api/transactions").then().statusCode(409);
        admin().body(checkout(item, second)).post("/api/transactions").then().statusCode(200);

        // A sibling's passing inspection does not clear the failed asset; the item summary keeps the earliest asset due date.
        admin().body(Map.of("itemId", item, "assetInstanceId", second, "scheduleId", secondSchedule, "type", "dguv_v3", "result", "passed"))
                .post("/api/maintenance").then().statusCode(200);
        admin().get("/api/items/" + item).then().body("nextMaintenanceDue", equalTo(due));
        admin().get("/api/items/" + item + "/assets").then()
                .body("find { it.id == '" + first + "' }.serviceStatus", equalTo("in_service"))
                .body("find { it.id == '" + second + "' }.availabilityStatus", equalTo("in_field"))
                .body("find { it.id == '" + second + "' }.nextMaintenanceDue",
                        equalTo(LocalDate.now().plusDays(365).toString()));

        admin().body(Map.of("itemId", item, "assetInstanceId", first, "scheduleId", firstSchedule, "type", "dguv_v3", "result", "passed"))
                .post("/api/maintenance").then().statusCode(200);
        admin().get("/api/items/" + item + "/assets").then()
                .body("find { it.id == '" + first + "' }.serviceStatus", equalTo("certified"))
                .body("find { it.id == '" + first + "' }.availabilityStatus", equalTo("available"));
    }

    @Test void overdueItemCalendarBlocksOnlyUninspectedAssets() { // H02
        String item = serializedItem(2, Map.of());
        var list = assets(item);
        String inspected = list.getString("[0].id"), pending = list.getString("[1].id");
        String schedule = dateSchedule(item, inspected, LocalDate.now().minusDays(1).toString());
        dateSchedule(item, pending, LocalDate.now().minusDays(1).toString());
        admin().body(Map.of("itemId", item, "assetInstanceId", inspected, "scheduleId", schedule, "type", "dguv_v3", "result", "passed"))
                .post("/api/maintenance").then().statusCode(200);
        admin().body(checkout(item, pending)).post("/api/transactions").then().statusCode(409);
        admin().body(checkout(item, inspected)).post("/api/transactions").then().statusCode(200);
    }

    private String dateSchedule(String item, String asset, String due) {
        return admin().body(Map.of("itemId",item,"assetInstanceId",asset,"maintenanceType","dguv_v3","intervalType","date","intervalValue",365,"nextDueAt",due+"T00:00:00Z","checkoutBlocking",true))
                .post("/api/maintenance-schedules").then().statusCode(201).extract().path("id");
    }

    private static RequestSpecification actor(String id, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", id).header("X-Actor-Name", id).header("X-Actor-Role", role);
    }

    @Test void freeTextContainingAPrivateIdNeverHidesAPublicRecord() { // H03
        String hidden = actor("audit-private-owner", "faction_leader").body(Map.of("sku", "AUD-P-" + UUID.randomUUID(), "name", "Private kit",
                "category", "Audit", "value", 0, "amount", 1)).post("/api/items").then().statusCode(200).extract().path("id");
        String item = admin().body(Map.of("sku", "AUD-" + UUID.randomUUID(), "name", "Public kit", "category", "Audit", "value", 0, "amount", 3))
                .post("/api/items").then().statusCode(200).extract().path("id");
        admin().body(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 1, "reason", "Audit",
                "notes", "Swapped against " + hidden)).post("/api/transactions").then().statusCode(200);
        actor("audit-reader", "read_only").get("/api/transactions?itemId=" + item).then().statusCode(200)
                .body("find { it.transactionType == 'checkout' }.notes", equalTo("Swapped against " + hidden));
        actor("audit-reader", "read_only").get("/api/items/" + hidden).then().statusCode(404);
    }

    @Test void catalogFiltersAndContinuationRunOnTheServer() { // H06, H07
        String tag = "AUD-" + UUID.randomUUID();
        String location = TestLocations.section(() -> admin(), Map.of("name", "Audit shelf " + tag));
        String first = admin().body(Map.of("sku", tag + "-1", "name", tag + " alpha", "category", tag, "value", 0, "amount", 1,
                "eventTypes", java.util.List.of("DE"), "storageLocation", location)).post("/api/items").then().statusCode(200).extract().path("id");
        String second = admin().body(Map.of("sku", tag + "-2", "name", tag + " beta", "category", tag, "value", 0, "amount", 1))
                .post("/api/items").then().statusCode(200).extract().path("id");
        admin().get("/api/items?category=" + tag + "&sort=name&page=0&size=1").then().statusCode(200)
                .header("X-Has-More", "true").body("id", equalTo(java.util.List.of(first)));
        admin().get("/api/items?category=" + tag + "&sort=name&page=1&size=1").then().statusCode(200)
                .header("X-Has-More", "true").body("id", equalTo(java.util.List.of(second)));
        admin().get("/api/items?category=" + tag + "&page=2&size=1").then().statusCode(200).header("X-Has-More", "false");
        admin().get("/api/items?category=" + tag + "&eventType=DE&size=10").then().body("id", equalTo(java.util.List.of(first)));
        admin().get("/api/items?locationId=" + location + "&size=10").then().body("id", equalTo(java.util.List.of(first)));
        admin().get("/api/items?id=" + second + "&id=" + first + "&sort=-name&size=10").then().body("id", equalTo(java.util.List.of(second, first)));
        admin().get("/api/storage-locations?search=" + tag + "&size=5").then().statusCode(200).body("id", equalTo(java.util.List.of(location)));
    }

    @Test void lotParentItemIsImmutableAndLotsCarryItemAndStock() { // LOT-H01, LOT-L02, LOT-L03
        String tag = "AUD-LOT-" + UUID.randomUUID();
        String location = TestLocations.section(() -> admin(), Map.of("name", "Lot shelf " + tag));
        String first = admin().body(Map.of("sku", tag + "-A", "name", tag + " A", "category", "Audit", "value", 0, "trackingMode", "lot_tracked",
                "storageLocation", location)).post("/api/items").then().statusCode(200).extract().path("id");
        String other = admin().body(Map.of("sku", tag + "-B", "name", tag + " B", "category", "Audit", "value", 0, "trackingMode", "lot_tracked"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String lot = admin().body(Map.of("itemId", first, "lotNumber", "L1")).post("/api/inventory-lots").then().statusCode(201)
                .body("itemName", equalTo(tag + " A")).body("empty", equalTo(true)).extract().path("id");
        admin().body(Map.of("itemId", other, "lotNumber", "L1")).put("/api/inventory-lots/" + lot).then().statusCode(400);
        admin().body(Map.of("itemId", first, "transactionType", "added", "quantityChanged", 4, "reason", "Audit", "lotId", lot,
                "locationId", location)).post("/api/transactions").then().statusCode(200);
        admin().queryParam("itemId", first).get("/api/inventory-lots").then().statusCode(200)
                .body("[0].itemId", equalTo(first)).body("[0].empty", equalTo(false))
                .body("[0].stock[0].locationId", equalTo(location)).body("[0].stock[0].onHand", equalTo(4));
        admin().body(Map.of("lotNumber", "L1-renamed", "status", "hold")).put("/api/inventory-lots/" + lot).then().statusCode(200)
                .body("itemId", equalTo(first));
    }
}
