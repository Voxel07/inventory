package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.junit.jupiter.api.Assertions.assertEquals;

/** Regressions for PERFORMANCE_SECURITY_REVIEW.md (2026-11-15). */
@QuarkusTest
class PerformanceSecurityReviewApiTest {
    private static RequestSpecification actor(String subject, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", subject).header("X-Actor-Name", subject)
                .header("X-Actor-Role", role).header("X-Actor-Factions", "");
    }
    private static RequestSpecification admin() { return actor("review-admin", "admin"); }

    private static String item(String location, int amount) {
        return admin().body(Map.of("name", "Review item " + UUID.randomUUID(), "category", "Review", "amount", amount,
                "storageLocation", location)).post("/api/items").then().statusCode(200).extract().path("id");
    }
    private static String factionOrder(String item, int quantity) {
        return admin().body(Map.of("eventType", "DE", "faction", "Review " + UUID.randomUUID(), "eventDate", 2254608000000L,
                "requestedQuantities", Map.of(item, quantity))).post("/api/orders/faction").then().statusCode(200).extract().path("id");
    }
    /** A rejected offline command whose payload names the order; its context re-reads that order for the caller. */
    private static RequestSpecification syncContext(String subject, String role, String order, int expected) {
        String key = UUID.randomUUID().toString();
        actor(subject, role).body(Map.of("actions", List.of(Map.of("idempotencyKey", key, "type", "order.transition",
                "payload", Map.of("orderId", order, "status", "closed"))))).post("/api/sync").then().statusCode(200)
                .body("results[0].status", equalTo("rejected"));
        actor(subject, role).get("/api/sync/" + key + "/context").then().statusCode(expected);
        return actor(subject, role);
    }

    @Test void factionLeadersReadFactionOrderDetailsButNoGeneralOrders() {
        String shelf = TestLocations.section(PerformanceSecurityReviewApiTest::admin, Map.of("name", "Review shelf " + UUID.randomUUID()));
        String item = item(shelf, 5);
        String faction = factionOrder(item, 1);
        String general = admin().body(Map.of("name", "Review general", "purpose", "Review", "requestedQuantities", Map.of(item, 1)))
                .post("/api/orders/general").then().statusCode(200).extract().path("id");
        String leader = "review-leader-" + UUID.randomUUID();

        syncContext(leader, "faction_leader", faction, 200);
        syncContext(leader, "faction_leader", general, 403);
        syncContext("review-ash-" + UUID.randomUUID(), "ash", general, 200);
    }

    @Test void parallelPickupsHandOverOnceAndReportConflicts() throws Exception {
        String shelf = TestLocations.section(PerformanceSecurityReviewApiTest::admin, Map.of("name", "Race shelf " + UUID.randomUUID()));
        String item = item(shelf, 10);
        String order = factionOrder(item, 4), path = "/api/orders/faction/" + order;
        admin().body(Map.of()).post(path + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(item, 4))).post(path + "/prepare").then().statusCode(200);
        admin().body(Map.of("pickupLocation", shelf, "pickupLatitude", 50.1, "pickupLongitude", 8.6))
                .post(path + "/transitions/ready").then().statusCode(200);

        var tasks = new ArrayList<Callable<Integer>>();
        for (int i = 0; i < 4; i++) tasks.add(() -> admin().body(Map.of()).post(path + "/transitions/picked_up").then().extract().statusCode());
        var pool = Executors.newFixedThreadPool(4);
        var statuses = new ArrayList<Integer>();
        try { for (var result : pool.invokeAll(tasks)) statuses.add(result.get()); } finally { pool.shutdown(); }
        statuses.sort(null);
        assertEquals(List.of(200, 409, 409, 409), statuses);
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.checkedOut", equalTo(4)).body("stock.onHand", equalTo(6));
        admin().queryParam("orderId", order).get("/api/handovers").then().statusCode(200).body("size()", equalTo(1));
    }

    @Test void returnSubmissionsArePaged() {
        String shelf = TestLocations.section(PerformanceSecurityReviewApiTest::admin, Map.of("name", "Return shelf " + UUID.randomUUID()));
        String item = item(shelf, 10);
        String order = factionOrder(item, 3), path = "/api/orders/faction/" + order;
        admin().body(Map.of()).post(path + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(item, 3))).post(path + "/prepare").then().statusCode(200);
        admin().body(Map.of("pickupLocation", shelf, "pickupLatitude", 50.1, "pickupLongitude", 8.6)).post(path + "/transitions/ready").then().statusCode(200);
        admin().body(Map.of()).post(path + "/transitions/picked_up").then().statusCode(200);
        // Custody of a faction order rests with its creator, who returns the units.
        for (int i = 0; i < 2; i++)
            admin().body(Map.of("itemId", item, "quantity", 1, "orderId", order)).post("/api/returns").then().statusCode(200);

        admin().queryParam("size", 1).get("/api/returns").then().statusCode(200).body("size()", equalTo(1)).header("X-Has-More", "true");
        admin().queryParam("size", 1).queryParam("page", 1).get("/api/returns").then().statusCode(200).body("size()", equalTo(1));
        admin().queryParam("mine", true).queryParam("size", 200).get("/api/returns").then().statusCode(200)
                .body("findAll { it.itemId == '" + item + "' }.size()", equalTo(2));
        // Another warehouse worker reviews them, but they are not that worker's own returns.
        var crew = actor("review-crew-" + UUID.randomUUID(), "warehouse_crew");
        crew.queryParam("size", 200).get("/api/returns").then().statusCode(200).body("findAll { it.itemId == '" + item + "' }.size()", equalTo(2));
        actor("review-crew-2-" + UUID.randomUUID(), "warehouse_crew").queryParam("mine", true).queryParam("size", 200).get("/api/returns")
                .then().statusCode(200).body("findAll { it.itemId == '" + item + "' }.size()", equalTo(0));
        admin().queryParam("size", 201).get("/api/returns").then().statusCode(400);
    }

    @Test void lotsOfSeveralItemsLoadInOneRequest() {
        String shelf = TestLocations.section(PerformanceSecurityReviewApiTest::admin, Map.of("name", "Lot shelf " + UUID.randomUUID()));
        var lots = new ArrayList<String>();
        var items = new ArrayList<String>();
        for (int i = 0; i < 2; i++) {
            String item = admin().body(Map.of("name", "Review lot item " + UUID.randomUUID(), "category", "Review",
                    "trackingMode", "lot_tracked", "storageLocation", shelf)).post("/api/items").then().statusCode(200).extract().path("id");
            items.add(item);
            lots.add(TestLots.receive(PerformanceSecurityReviewApiTest::admin, item, 2, shelf, "L-" + i, null, null));
        }
        admin().queryParam("itemId", items.get(0)).queryParam("itemId", items.get(1)).get("/api/inventory-lots").then().statusCode(200)
                .body("id", containsInAnyOrder(lots.toArray()));
        admin().queryParam("itemId", items.get(1)).get("/api/inventory-lots").then().statusCode(200).body("id", containsInAnyOrder(lots.get(1)));
        // The location filter runs the access subquery for the position's location as well.
        admin().queryParam("itemId", items.get(0)).queryParam("itemId", items.get(1)).queryParam("locationId", shelf).get("/api/inventory-lots")
                .then().statusCode(200).body("id", containsInAnyOrder(lots.toArray()));
        String elsewhere = TestLocations.section(PerformanceSecurityReviewApiTest::admin, Map.of("name", "Empty lot shelf " + UUID.randomUUID()));
        admin().queryParam("itemId", items.get(0)).queryParam("locationId", elsewhere).get("/api/inventory-lots")
                .then().statusCode(200).body("size()", equalTo(0));
        actor("review-reader-" + UUID.randomUUID(), "read_only").queryParam("itemId", items.get(0)).queryParam("locationId", shelf)
                .get("/api/inventory-lots").then().statusCode(200).body("id", containsInAnyOrder(lots.get(0)));
    }
}
