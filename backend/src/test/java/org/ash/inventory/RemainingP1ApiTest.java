package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;
import java.util.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class RemainingP1ApiTest {
    private RequestSpecification admin() { return given().contentType(ContentType.JSON).header("X-Actor-Id", "remaining-p1-admin").header("X-Actor-Role", "hq_admin"); }
    private RequestSpecification reader() { return given().contentType(ContentType.JSON).header("X-Actor-Id", "remaining-p1-reader").header("X-Actor-Role", "read_only"); }
    private String item() {
        return admin().body(Map.of("sku", "P1-" + UUID.randomUUID(), "name", "P1 report item", "category", "P1", "amount", 3, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
    }
    private Map<String, Object> action(String key, String item, int amount) {
        return Map.of("idempotencyKey", key, "type", "transaction", "payload", Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", amount, "eventType", "DE", "faction", "P1"));
    }
    private Map<String, Object> batch(Map<String, Object> action) { return Map.of("actions", List.of(action)); }

    @Test void hierarchyRejectsCyclesCrossWarehouseParentsAndInvalidDeactivation() {
        String warehouse = admin().body(Map.of("code", "P1-" + UUID.randomUUID(), "name", "P1 Warehouse"))
                .post("/api/warehouses").then().statusCode(201).extract().path("id");
        String parent = admin().body(Map.of("name", "P1 parent", "warehouseId", warehouse, "locationType", "warehouse"))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String child = admin().body(Map.of("name", "P1 child", "warehouseId", warehouse, "parentLocationId", parent, "locationType", "bin"))
                .post("/api/storage-locations").then().statusCode(200).body("parentLocationId", equalTo(parent)).extract().path("id");
        admin().body(Map.of("name", "P1 parent", "warehouseId", warehouse, "parentLocationId", child)).patch("/api/storage-locations/" + parent).then().statusCode(409);
        admin().body(Map.of("name", "Unassigned child", "parentLocationId", parent)).post("/api/storage-locations").then().statusCode(409);
        admin().delete("/api/storage-locations/" + parent).then().statusCode(409);
        admin().delete("/api/warehouses/" + warehouse).then().statusCode(409);
        admin().delete("/api/storage-locations/" + child).then().statusCode(204);
        admin().get("/api/storage-locations?includeInactive=true").then().statusCode(200).body("find { it.id == '" + child + "' }.active", equalTo(false));
        admin().delete("/api/storage-locations/" + parent).then().statusCode(204);
        admin().body(Map.of("name", "P1 child", "warehouseId", warehouse, "parentLocationId", parent, "active", true)).patch("/api/storage-locations/" + child).then().statusCode(409);
        reader().body(Map.of("name", "Unauthorized location")).post("/api/storage-locations").then().statusCode(403);
    }

    @Test void correctionRetainsOriginalAndCannotApplyTwiceOrCrossAccounts() {
        String item = item(); String originalId = UUID.randomUUID().toString();
        admin().body(batch(action(UUID.randomUUID().toString(), item, -1))).post("/api/sync").then().statusCode(200).body("results[0].status", equalTo("rejected"));
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.onHand", equalTo(3));
        var original = action(originalId, item, 99);
        admin().body(batch(original)).post("/api/sync").then().statusCode(200).body("results[0].status", equalTo("conflict"));
        admin().body(batch(action(originalId, item, 1))).post("/api/sync").then().statusCode(200).body("results[0].status", equalTo("rejected"));
        admin().get("/api/sync/" + originalId + "/context").then().statusCode(200).body("command.payload.quantityChanged", equalTo(99)).body("item.stock.onHand", equalTo(3));
        reader().get("/api/sync/" + originalId + "/context").then().statusCode(404);
        reader().get("/api/sync/audit/mine").then().statusCode(200).body("find { it.commandId == '" + originalId + "' }", nullValue());
        var corrected = new HashMap<>(action(UUID.randomUUID().toString(), item, 1));
        corrected.put("supersedes", originalId); corrected.put("resolutionNote", "Reviewed available balance; issue one unit");
        admin().body(batch(corrected)).post("/api/sync").then().statusCode(200).body("results[0].status", equalTo("applied"));
        admin().body(batch(corrected)).post("/api/sync").then().statusCode(200).body("results[0].status", equalTo("applied"));
        corrected.put("idempotencyKey", UUID.randomUUID().toString());
        admin().body(batch(corrected)).post("/api/sync").then().statusCode(200).body("results[0].status", equalTo("conflict"));
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.onHand", equalTo(2));
        admin().get("/api/sync/" + originalId + "/context").then().statusCode(200).body("command.payload.quantityChanged", equalTo(99)).body("command.syncStatus", equalTo("conflict"));
    }

    @Test void reportsRetainSnapshotsUntilRebuiltAndNeverWriteStock() {
        String item = item();
        var event = new HashMap<String, Object>(Map.of("name", "P1 planned-only event", "eventType", "DE", "startDate", "2039-04-12", "endDate", "2039-04-13", "plannedQuantities", Map.of(item, 20)));
        String eventId = admin().body(event).post("/api/events").then().statusCode(200).extract().path("id");
        admin().post("/api/reports/events/rebuild").then().statusCode(204);
        String filter = "/api/reports/events?eventId=" + eventId + "&itemId=" + item;
        admin().get(filter).then().statusCode(200).body("total", equalTo(1)).body("rows[0].planned", equalTo(20)).body("rows[0].handedOver", equalTo(0)).body("stale", equalTo(false));
        String generation = admin().get(filter).then().statusCode(200).extract().path("generatedAt");
        admin().queryParam("generation", generation).queryParam("eventId", eventId).queryParam("itemId", item)
                .get("/api/reports/events/export").then().statusCode(200)
                .body("generatedAt", equalTo(generation)).body("total", equalTo(1)).body("rows[0].planned", equalTo(20));
        admin().get("/api/reports/events/export").then().statusCode(400);
        event.put("plannedQuantities", Map.of(item, 25));
        admin().body(event).patch("/api/events/" + eventId).then().statusCode(200);
        admin().get(filter).then().statusCode(200).body("rows[0].planned", equalTo(20)).body("stale", equalTo(true));
        admin().queryParam("generation", generation).queryParam("eventId", eventId).queryParam("itemId", item)
                .get("/api/reports/events/export").then().statusCode(200)
                .body("rows[0].planned", equalTo(20)).body("stale", equalTo(true));
        admin().post("/api/reports/events/rebuild").then().statusCode(204);
        admin().queryParam("generation", generation).get("/api/reports/events/export").then().statusCode(409);
        admin().get(filter).then().statusCode(200).body("rows[0].planned", equalTo(25));
        admin().get(filter + "&from=2040-01-01").then().statusCode(200).body("total", equalTo(0));
        admin().get(filter + "&from=bad-date").then().statusCode(400);
        for (String name : List.of("availability", "returns", "repairs", "maintenance", "purchases", "counts", "movements")) {
            admin().post("/api/reports/" + name + "/rebuild").then().statusCode(204);
            admin().get("/api/reports/" + name).then().statusCode(200).body("generatedAt", notNullValue());
        }
        admin().get("/api/reports/availability?itemId=" + item).then().statusCode(200)
                .body("rows[0].status", equalTo("location_reconciliation_required")).body("rows[0].onHand", equalTo(3)).body("rows[0].available", equalTo(0));
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.onHand", equalTo(3));
        admin().get("/api/transactions?itemId=" + item).then().statusCode(200).body("size()", equalTo(1));
        reader().get("/api/reports/events").then().statusCode(403);
        reader().post("/api/reports/events/rebuild").then().statusCode(403);
    }

    @Test void generalOrderSummariesOmitHistoryAndDetailsRetainActorScope() {
        var owner = given().contentType(ContentType.JSON).header("X-Actor-Id", "p02-order-owner").header("X-Actor-Role", "faction_leader");
        var other = given().contentType(ContentType.JSON).header("X-Actor-Id", "p02-order-other").header("X-Actor-Role", "faction_leader");
        String id = owner.body(Map.of("name", "P02 summary", "purpose", "History on demand"))
                .post("/api/general-orders").then().statusCode(200).extract().path("id");
        owner.body(Map.of("name", "P02 summary updated", "purpose", "History on demand"))
                .patch("/api/general-orders/" + id).then().statusCode(200);
        Map<String, Object> summary = owner.get("/api/general-orders").then().statusCode(200)
                .extract().path("find { it.id == '" + id + "' }");
        org.junit.jupiter.api.Assertions.assertFalse(summary.containsKey("history"));
        owner.get("/api/general-orders/" + id).then().statusCode(200)
                .body("name", equalTo("P02 summary updated")).body("history.action", hasItems("created", "updated"));
        other.get("/api/general-orders").then().statusCode(200).body("id", not(hasItem(id)));
        other.get("/api/general-orders/" + id).then().statusCode(403);
        admin().get("/api/general-orders/" + id).then().statusCode(200).body("history.size()", equalTo(2));
    }
}
