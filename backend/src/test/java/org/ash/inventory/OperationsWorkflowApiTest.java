package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class OperationsWorkflowApiTest {
    private RequestSpecification admin() {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "operations-workflow-admin")
                .header("X-Actor-Role", "admin");
    }

    private String item(boolean serialized, int quantity) {
        String location = TestLocations.section(this::admin, Map.of("name", "Operations review " + UUID.randomUUID()));
        return admin().body(Map.of("sku", "OPS-" + UUID.randomUUID(), "name", "Workflow equipment",
                "category", "Workflow review", "amount", quantity, "storageLocation", location,
                "trackingMode", serialized ? "serialized" : "bulk"))
                .post("/api/items").then().statusCode(200).extract().path("id");
    }

    private String schedule(String item, String asset, String type, long due) {
        var body = new HashMap<String, Object>(Map.of("itemId", item, "maintenanceType", type,
                "intervalType", "date", "intervalValue", 30, "nextDueAt", due, "checkoutBlocking", true));
        if (asset != null) body.put("assetInstanceId", asset);
        return admin().body(body).post("/api/maintenance-schedules").then().statusCode(201).extract().path("id");
    }

    private void inspection(String item, String asset, String type, String result) {
        var body = new HashMap<String, Object>(Map.of("itemId", item, "type", type, "result", result));
        if (asset != null) body.put("assetInstanceId", asset);
        admin().body(body).post("/api/maintenance").then().statusCode(200);
    }

    @Test void independentFailuresSurviveOtherPassesAndAdvisories() {
        String item = item(true, 2);
        String asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
        inspection(item, asset, "dguv_v3", "failed");
        inspection(item, asset, "battery_test", "passed");
        inspection(item, asset, "dguv_v3", "advisory");
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(1))
                .body("stock.maintenance", equalTo(1)).body("maintenanceStatus", equalTo("out_of_service"));
        inspection(item, asset, "dguv_v3", "passed");
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(2))
                .body("stock.maintenance", equalTo(0));
    }

    @Test void overdueAdvisoryPlansRemainSelectableUntilBlockingIsEnabled() {
        String item = item(true, 1);
        String asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
        var input = new HashMap<String, Object>(Map.of("itemId", item, "assetInstanceId", asset,
                "maintenanceType", "battery_test", "intervalType", "date", "intervalValue", 30,
                "nextDueAt", 1577836800000L, "checkoutBlocking", false));
        String plan = admin().body(input).post("/api/maintenance-schedules").then().statusCode(201).extract().path("id");
        admin().get("/api/items/" + item + "/assets").then().statusCode(200)
                .body("[0].serviceStatus", equalTo("overdue")).body("[0].maintenanceBlocked", equalTo(false));
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(1));
        input.put("checkoutBlocking", true);
        admin().body(input).put("/api/maintenance-schedules/" + plan).then().statusCode(200);
        admin().get("/api/items/" + item + "/assets").then().statusCode(200).body("[0].maintenanceBlocked", equalTo(true));
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(0));
        admin().body(Map.of("itemId", item, "assetInstanceId", asset, "transactionType", "checkout", "quantityChanged", 1,
                "eventType", "DE", "faction", "Review")).post("/api/transactions").then().statusCode(409);
    }

    @Test void inspectionMustMatchAnActiveScheduleAndCannotAdvanceAnEntireFleetFromOneDevice() {
        String item = item(true, 2);
        String asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
        String plan = schedule(item, asset, "dguv_v3", 1577836800000L);
        admin().body(Map.of("itemId", item, "assetInstanceId", asset, "scheduleId", plan,
                "type", "battery_test", "result", "passed")).post("/api/maintenance").then().statusCode(400);
        admin().delete("/api/maintenance-schedules/" + plan).then().statusCode(204);
        admin().body(Map.of("itemId", item, "assetInstanceId", asset, "scheduleId", plan,
                "type", "dguv_v3", "result", "passed")).post("/api/maintenance").then().statusCode(400);
        String fleet = schedule(item, null, "dguv_v3", 1577836800000L);
        admin().body(Map.of("itemId", item, "assetInstanceId", asset, "scheduleId", fleet,
                "type", "dguv_v3", "result", "passed")).post("/api/maintenance").then().statusCode(400);
        // A deliberately selected fleet inspection covers the whole item, not one device.
        admin().body(Map.of("itemId", item, "scheduleId", fleet, "type", "dguv_v3", "result", "passed"))
                .post("/api/maintenance").then().statusCode(200);
    }

    private String damage(String item, String asset, int quantity) {
        var body = new HashMap<String, Object>(Map.of("itemId", item, "amount", quantity,
                "description", "Workshop repair", "severity", "high", "idempotencyKey", UUID.randomUUID()));
        if (asset != null) body.put("assetInstanceId", asset);
        return admin().body(body).post("/api/damage-reports").then().statusCode(200).extract().path("id");
    }

    private void transition(String repair, String status, int amount, String expected) {
        admin().body(Map.of("status", status, "amount", amount, "notes", "Work: " + status,
                "verificationResult", "Checked safe", "idempotencyKey", UUID.randomUUID()))
                .post("/api/repairs/" + repair + "/transitions").then().statusCode(200).body("status", equalTo(expected));
    }

    @Test void partialRepairAndWriteOffKeepTheCaseOpenAndCannotBypassVerification() {
        String item = item(false, 5);
        String damage = damage(item, null, 3);
        String repair = admin().body(Map.of("damageReportId", damage)).post("/api/repairs")
                .then().statusCode(201).body("unresolvedQuantity", equalTo(3)).extract().path("id");
        admin().body(Map.of("status", "repaired", "amount", 3)).patch("/api/damage-reports/" + damage)
                .then().statusCode(409);
        transition(repair, "triaged", 1, "triaged");
        transition(repair, "awaiting_repair", 1, "awaiting_repair");
        transition(repair, "in_repair", 1, "in_repair");
        transition(repair, "repaired", 1, "repaired");
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(2));
        transition(repair, "verified", 1, "verified");
        transition(repair, "returned_to_service", 1, "awaiting_repair");
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(3));
        transition(repair, "written_off", 1, "awaiting_repair");
        transition(repair, "written_off", 1, "written_off");
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(3))
                .body("stock.totalOwned", equalTo(3)).body("stock.damaged", equalTo(0));
        admin().queryParam("itemId", item).get("/api/damage-reports").then().statusCode(200)
                .body("[0].status", equalTo("resolved")).body("[0].repairCaseId", equalTo(repair));
    }

    @Test void resolvingOneReportDoesNotClearAnotherDamageOrFailedInspection() {
        String item = item(true, 1);
        String asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
        String first = damage(item, asset, 1);
        String second = damage(item, asset, 1);
        admin().body(Map.of("status", "repaired", "amount", 1)).patch("/api/damage-reports/" + first)
                .then().statusCode(200);
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(0))
                .body("stock.damaged", equalTo(1));
        inspection(item, asset, "dguv_v3", "failed");
        admin().body(Map.of("status", "repaired", "amount", 1)).patch("/api/damage-reports/" + second)
                .then().statusCode(200);
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.available", equalTo(0))
                .body("stock.maintenance", equalTo(1));
    }

    @Test void purchasingTracksDraftQuantitiesPartialReceiptsAndCancellationPerRequest() {
        String item = item(false, 0);
        String location = admin().get("/api/items/" + item).then().statusCode(200).extract().path("storageLocation");
        String[] requests = new String[2];
        for (int index = 0; index < 2; index++) {
            String order = admin().body(Map.of("name", "Requested equipment " + index, "purpose", "Operations review",
                    "requestedQuantities", Map.of(), "itemRequests", java.util.List.of(Map.of("name", "New equipment", "quantity", 3))))
                    .post("/api/orders/general").then().statusCode(200).extract().path("id");
            requests[index] = admin().get("/api/orders/general/" + order).then().statusCode(200).extract().path("itemRequests[0].id");
            admin().body(Map.of("itemId", item)).post("/api/procurement/item-requests/" + requests[index] + "/item")
                    .then().statusCode(200);
        }
        String vendor = admin().body(Map.of("name", "Workflow supplier " + UUID.randomUUID()))
                .post("/api/vendors").then().statusCode(201).extract().path("id");
        var purchase = admin().body(Map.of("vendorId", vendor, "lines", java.util.List.of(
                Map.of("itemId", item, "orderedQuantity", 4, "unitPriceCents", 0))))
                .post("/api/purchase-orders").then().statusCode(201).extract().jsonPath();
        String purchaseId = purchase.getString("id");
        String purchaseLine = purchase.getString("lines[0].id");
        // Four units cannot promise two separate requests for three units each, and a draft is not ordered.
        var queue = admin().get("/api/procurement/item-requests").then().statusCode(200);
        queue.body("find { it.request.id == '" + requests[0] + "' }.request.status", equalTo("item_created"))
                .body("find { it.request.id == '" + requests[1] + "' }.request.purchaseOrderId", nullValue());
        admin().body(Map.of("status", "ordered")).post("/api/purchase-orders/" + purchaseId + "/transitions").then().statusCode(200);
        var receipt = Map.of("purchaseOrderId", purchaseId, "receivingLocationId", location, "idempotencyKey", UUID.randomUUID(),
                "lines", java.util.List.of(Map.of("purchaseOrderLineId", purchaseLine, "acceptedQuantity", 2, "damagedQuantity", 0, "rejectedQuantity", 0)));
        admin().body(receipt).post("/api/goods-receipts").then().statusCode(201);
        admin().body(receipt).post("/api/goods-receipts").then().statusCode(201);
        admin().body(Map.of("status", "cancelled")).post("/api/purchase-orders/" + purchaseId + "/transitions").then().statusCode(200);
        admin().get("/api/procurement/item-requests").then().statusCode(200)
                .body("find { it.request.id == '" + requests[0] + "' }.request.receivedQuantity", equalTo(2))
                .body("find { it.request.id == '" + requests[0] + "' }.request.status", equalTo("item_created"));
        var replacement = admin().body(Map.of("vendorId", vendor, "lines", java.util.List.of(
                Map.of("itemId", item, "orderedQuantity", 1, "unitPriceCents", 0))))
                .post("/api/purchase-orders").then().statusCode(201).extract().jsonPath();
        String replacementId = replacement.getString("id");
        admin().body(Map.of("status", "ordered")).post("/api/purchase-orders/" + replacementId + "/transitions").then().statusCode(200);
        admin().body(Map.of("purchaseOrderId", replacementId, "receivingLocationId", location, "idempotencyKey", UUID.randomUUID(),
                "lines", java.util.List.of(Map.of("purchaseOrderLineId", replacement.getString("lines[0].id"), "acceptedQuantity", 1, "damagedQuantity", 0, "rejectedQuantity", 0))))
                .post("/api/goods-receipts").then().statusCode(201);
        admin().queryParam("includeResolved", true).get("/api/procurement/item-requests").then().statusCode(200)
                .body("find { it.request.id == '" + requests[0] + "' }.request.status", equalTo("received"))
                .body("find { it.request.id == '" + requests[0] + "' }.request.receivedQuantity", equalTo(3))
                .body("find { it.request.id == '" + requests[1] + "' }.request.status", equalTo("item_created"));
        admin().body(Map.of("vendorId", vendor, "itemRequestIds", java.util.List.of(requests[1]), "lines", java.util.List.of(
                Map.of("itemId", item, "orderedQuantity", 2, "unitPriceCents", 0))))
                .post("/api/purchase-orders").then().statusCode(409);
    }
}
