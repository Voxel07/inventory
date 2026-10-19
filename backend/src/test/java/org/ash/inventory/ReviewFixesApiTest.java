package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

/** Regressions for APPLICATION_REVIEW_2026-10-14 stock, custody and count findings. */
@QuarkusTest
class ReviewFixesApiTest {
    private static RequestSpecification actor(String id, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", id).header("X-Actor-Name", id).header("X-Actor-Role", role);
    }
    private static RequestSpecification admin() { return actor("review-admin", "admin"); }

    private static String item(Map<String, Object> extra) {
        var body = new HashMap<String, Object>(Map.of("sku", "REV-" + UUID.randomUUID(), "name", "Review item",
                "category", "Review", "value", 0));
        body.putAll(extra);
        return admin().body(body).post("/api/items").then().statusCode(200).extract().path("id");
    }
    private static Map<String, Object> tx(String item, String type, int quantity) {
        return new HashMap<>(Map.of("itemId", item, "transactionType", type, "quantityChanged", quantity, "reason", "Review"));
    }

    @Test void repairOfCheckedOutAssetKeepsItInCustody() { // REV-01
        String item = item(Map.of("amount", 1, "trackingMode", "serialized"));
        String asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
        var checkout = tx(item, "checkout", 1); checkout.put("assetInstanceId", asset);
        admin().body(checkout).post("/api/transactions").then().statusCode(200);
        String damage = admin().body(Map.of("itemId", item, "assetInstanceId", asset, "amount", 1,
                "description", "Cracked housing", "severity", "high")).post("/api/damage-reports").then().statusCode(200).extract().path("id");
        String repair = admin().body(Map.of("damageReportId", damage)).post("/api/repairs").then().statusCode(201).extract().path("id");
        for (var status : new String[] {"triaged", "awaiting_repair", "in_repair", "repaired", "verified", "returned_to_service"}) {
            var body = new HashMap<String, Object>(Map.of("status", status));
            if (status.equals("verified")) body.put("verificationResult", "Function test passed");
            admin().body(body).post("/api/repairs/" + repair + "/transitions").then().statusCode(200);
        }
        admin().get("/api/items/" + item + "/assets").then().statusCode(200)
                .body("[0].availabilityStatus", equalTo("in_field")).body("[0].conditionStatus", equalTo("good"));
        admin().body(checkout).post("/api/transactions").then().statusCode(409);
    }

    @Test void directCheckInSettlesTheExactCustodian() { // REV-02, REV-03
        String item = item(Map.of("amount", 3));
        String alice = actor("review-alice", "ash").get("/api/auth/me").then().statusCode(200).extract().path("id");
        var checkout = tx(item, "checkout", 2); checkout.put("userId", alice);
        admin().body(checkout).post("/api/transactions").then().statusCode(200);
        admin().delete("/api/items/" + item).then().statusCode(409);
        admin().body(tx(item, "checkin", 1)).post("/api/transactions").then().statusCode(409);
        var aliceReturn = tx(item, "checkin", 2); aliceReturn.put("userId", alice);
        admin().body(aliceReturn).post("/api/transactions").then().statusCode(200).body("userId", equalTo(alice));
        admin().delete("/api/items/" + item).then().statusCode(204);
    }

    @Test void blindRecountHidesExpectedQuantityUntilReview() { // REV-10
        String location = TestLocations.section(() -> admin(), Map.of("name", "Review shelf " + UUID.randomUUID(), "privateResource", false));
        String item = item(Map.of("amount", 5, "storageLocation", location));
        String count = admin().body(Map.of("locationId", location, "itemId", item, "blindCount", true))
                .post("/api/inventory-counts").then().statusCode(201).extract().path("id");
        String line = admin().body(Map.of()).post("/api/inventory-counts/" + count + "/start").then().statusCode(200)
                .body("lines[0].expectedQuantity", nullValue()).extract().path("lines[0].id");
        var observation = Map.of("lines", java.util.List.of(Map.of("lineId", line, "quantity", 3)));
        admin().body(observation).post("/api/inventory-counts/" + count + "/submit").then().statusCode(200)
                .body("status", equalTo("awaiting_recount")).body("lines[0].expectedQuantity", nullValue());
        admin().body(observation).post("/api/inventory-counts/" + count + "/recount").then().statusCode(200)
                .body("status", equalTo("awaiting_approval")).body("lines[0].expectedQuantity", equalTo(5));
    }

    @Test void inventoryRoleIsTheConsumableAuthority() { // REV-13, L09
        admin().body(Map.of("sku", "REV-" + UUID.randomUUID(), "name", "Serialized consumable", "category", "Review", "value", 0,
                "trackingMode", "serialized", "inventoryRole", "consumable"))
                .post("/api/items").then().statusCode(400);
        admin().body(Map.of("sku", "REV-" + UUID.randomUUID(), "name", "Bulk consumable", "category", "Review", "value", 0,
                "inventoryRole", "consumable"))
                .post("/api/items").then().statusCode(200).body("isConsumable", equalTo(true)).body("inventoryRole", equalTo("consumable"));
    }
}
