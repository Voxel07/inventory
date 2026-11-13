package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

/** REST handlers that the rest of the suite never reached with a successful call (see tests/tools/endpoint_coverage.py). */
@QuarkusTest
class EndpointGapApiTest {
    @Inject EntityManager em;

    private static RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "gap-" + name)
                .header("X-Actor-Name", "Gap " + name).header("X-Actor-Role", role);
    }
    private static RequestSpecification admin() { return actor("admin", "admin"); }
    private static RequestSpecification reader() { return actor("reader", "read_only"); }
    private static String id(RequestSpecification actor) { return actor.get("/api/auth/me").then().statusCode(200).extract().path("id"); }

    private static String event() {
        return admin().body(Map.of("eventType", "DE", "name", "Gap " + UUID.randomUUID(), "startDate", 2187820800000L,
                "endDate", 2187993600000L, "status", "planned")).post("/api/events").then().statusCode(200).extract().path("id");
    }
    private static String item(String category, int amount, String location) {
        var body = new HashMap<String, Object>(Map.of("name", "Gap item " + UUID.randomUUID(), "category", category, "amount", amount, "value", 0));
        if (location != null) body.put("storageLocation", location);
        return admin().body(body).post("/api/items").then().statusCode(200).extract().path("id");
    }

    @Test void integrationConsumersLeaseAcknowledgeDeadLetterRetryAndRemove() {
        String consumer = "gap-" + UUID.randomUUID().toString().substring(0, 8);
        String path = "/api/integration/consumers/" + consumer;
        var registration = Map.of("prefixes", List.of("catalog."), "since", Instant.now().minusSeconds(1).toEpochMilli());
        reader().body(registration).put(path).then().statusCode(403);
        admin().body(Map.of("prefixes", List.of(), "since", Instant.now().toEpochMilli())).put(path).then().statusCode(400);
        admin().body(registration).put(path).then().statusCode(204);
        admin().body(registration).put(path).then().statusCode(409);
        admin().post(path + "/poll?limit=0").then().statusCode(400);

        String created = item("Gap integration", 0, null);
        var batch = admin().post(path + "/poll?limit=100").then().statusCode(200).extract().jsonPath();
        List<String> types = batch.getList("deliveries.event.type", String.class);
        assertFalse(types.isEmpty());
        assertTrue(types.stream().allMatch(type -> type.startsWith("catalog.")), types.toString());
        String event = batch.getString("deliveries.find { it.event.aggregateId == '" + created + "' }.event.eventId");
        String lease = batch.getString("deliveries.find { it.event.aggregateId == '" + created + "' }.lease");
        assertNotNull(event, "the new item's catalog event must be delivered");

        // A leased event is not handed out again while the lease is valid.
        admin().post(path + "/poll?limit=100").then().statusCode(200).body("deliveries.event.eventId", not(hasItem(event)));
        admin().body(Map.of("eventId", event, "lease", UUID.randomUUID())).post(path + "/ack").then().statusCode(409);
        admin().body(Map.of("eventId", event, "lease", lease)).post(path + "/ack").then().statusCode(204);
        admin().get(path + "/status").then().statusCode(200).body("acknowledged", greaterThanOrEqualTo(1));
        admin().post(path + "/poll?limit=100").then().statusCode(200).body("deliveries.event.eventId", not(hasItem(event)));

        // An event whose leases keep expiring becomes a dead letter on its 11th delivery, and can be retried.
        String second = item("Gap integration", 0, null);
        var leased = admin().post(path + "/poll?limit=100").then().statusCode(200).extract().jsonPath();
        String poisoned = leased.getString("deliveries.find { it.event.aggregateId == '" + second + "' }.event.eventId");
        assertNotNull(poisoned);
        QuarkusTransaction.requiringNew().run(() -> em.createNativeQuery(
                "update integration_deliveries set attempts = 10, lease_until = 0 where consumer = :c and event_id = :e")
                .setParameter("c", consumer).setParameter("e", UUID.fromString(poisoned)).executeUpdate());
        admin().post(path + "/poll?limit=100").then().statusCode(200).body("deliveries.event.eventId", not(hasItem(poisoned)));
        admin().get(path + "/dead-letters").then().statusCode(200).body("$", hasItem(poisoned));
        admin().get(path + "/status").then().statusCode(200).body("dead_letter", equalTo(1));
        admin().post(path + "/dead-letters/" + UUID.randomUUID() + "/retry").then().statusCode(404);
        admin().post(path + "/dead-letters/" + poisoned + "/retry").then().statusCode(204);
        admin().post(path + "/poll?limit=100").then().statusCode(200)
                .body("deliveries.find { it.event.eventId == '" + poisoned + "' }.attempt", equalTo(1));

        admin().delete(path).then().statusCode(204);
        admin().post(path + "/poll").then().statusCode(404);
    }

    @Test void eventPeopleCateringAndTimelineAreManagedByPlanners() {
        String event = event();
        reader().body(Map.of("name", "Nope")).post("/api/event-people").then().statusCode(403);
        String name = "Gap person " + UUID.randomUUID();
        String person = admin().body(Map.of("name", name)).post("/api/event-people").then().statusCode(200)
                .body("name", equalTo(name)).body("attendances", equalTo(0)).extract().path("id");
        admin().body(Map.of("name", name + " renamed")).put("/api/event-people/" + person).then().statusCode(200)
                .body("name", equalTo(name + " renamed"));
        admin().get("/api/event-people").then().statusCode(200).body("find { it.id == '" + person + "' }.name", equalTo(name + " renamed"));

        var attendee = new HashMap<String, Object>(Map.of("personId", person, "personName", name + " renamed",
                "arrivesAt", 2187849600000L, "leavesAt", 2188058400000L, "foodStampsIssued", false,
                "roles", List.of(Map.of("role", "as_held"))));
        String attendance = admin().body(attendee).post("/api/events/" + event + "/attendees").then().statusCode(200).extract().path("id");
        admin().delete("/api/event-people/" + person).then().statusCode(409);
        attendee.put("foodStampsIssued", true);
        attendee.put("notes", "Arrives late");
        admin().body(attendee).put("/api/events/" + event + "/attendees/" + attendance).then().statusCode(200)
                .body("foodStampsIssued", equalTo(true)).body("notes", equalTo("Arrives late"));
        admin().body(attendee).put("/api/events/" + event() + "/attendees/" + attendance).then().statusCode(404);

        admin().get("/api/events/" + event + "/catering").then().statusCode(200).body("dailyMainMealStamps", notNullValue());
        reader().body(Map.of("dailyMainMealStamps", 2, "dailyBreakfastStamps", 1, "firstDayMainMealStamps", 1))
                .put("/api/events/" + event + "/catering").then().statusCode(403);
        admin().body(Map.of("dailyMainMealStamps", 1001, "dailyBreakfastStamps", 1, "firstDayMainMealStamps", 1))
                .put("/api/events/" + event + "/catering").then().statusCode(400);
        admin().body(Map.of("dailyMainMealStamps", 3, "dailyBreakfastStamps", 1, "firstDayMainMealStamps", 2))
                .put("/api/events/" + event + "/catering").then().statusCode(200).body("dailyMainMealStamps", equalTo(3));
        admin().get("/api/events/" + event + "/catering").then().statusCode(200)
                .body("dailyMainMealStamps", equalTo(3)).body("dailyBreakfastStamps", equalTo(1)).body("firstDayMainMealStamps", equalTo(2));

        String entry = admin().body(Map.of("category", "preparation", "title", "Set up tents", "startsAt", 2187849600000L, "status", "planned"))
                .post("/api/events/" + event + "/timeline").then().statusCode(200).extract().path("id");
        admin().delete("/api/events/" + event() + "/timeline/" + entry).then().statusCode(404);
        admin().delete("/api/events/" + event + "/timeline/" + entry).then().statusCode(204);
        admin().get("/api/events/" + event + "/timeline").then().statusCode(200).body("id", not(hasItem(entry)));

        admin().delete("/api/events/" + event + "/attendees/" + attendance).then().statusCode(204);
        admin().delete("/api/event-people/" + person).then().statusCode(204);
        admin().get("/api/event-people").then().statusCode(200).body("id", not(hasItem(person)));
    }

    @Test void itemRequestsAreQueuedLinkedToItemsAndDeclinedByAdmins() {
        var order = new HashMap<String, Object>(Map.of("name", "Gap request order", "purpose", "Needs new gear",
                "requestedQuantities", Map.of(),
                "itemRequests", List.of(Map.of("name", "Fog machine", "quantity", 2, "note", "Smoke effects"),
                        Map.of("name", "Spare radio", "quantity", 1))));
        var created = actor("requester", "ash").body(order).post("/api/orders/general").then().statusCode(200).extract().jsonPath();
        String orderId = created.getString("id");
        String fog = created.getString("itemRequests.find { it.name == 'Fog machine' }.id");
        String radio = created.getString("itemRequests.find { it.name == 'Spare radio' }.id");

        actor("requester", "ash").get("/api/procurement/item-requests").then().statusCode(403);
        admin().get("/api/procurement/item-requests").then().statusCode(200)
                .body("find { it.request.id == '" + fog + "' }.orderId", equalTo(orderId))
                .body("find { it.request.id == '" + fog + "' }.request.quantity", equalTo(2))
                .body("find { it.request.id == '" + fog + "' }.request.status", equalTo("open"));

        String item = item("Gap procurement", 0, null);
        admin().body(Map.of("itemId", item)).post("/api/procurement/item-requests/" + fog + "/item").then().statusCode(200)
                .body("request.itemId", equalTo(item)).body("request.status", not(equalTo("open")));
        admin().body(Map.of("itemId", item)).post("/api/procurement/item-requests/" + fog + "/item").then().statusCode(409);

        admin().body(Map.of("reason", " ")).post("/api/procurement/item-requests/" + radio + "/decline").then().statusCode(400);
        admin().body(Map.of("reason", "Use the existing radios")).post("/api/procurement/item-requests/" + radio + "/decline").then().statusCode(200)
                .body("request.status", equalTo("declined")).body("request.declineReason", equalTo("Use the existing radios"));
        admin().get("/api/procurement/item-requests").then().statusCode(200).body("request.id", not(hasItem(radio)));
        admin().get("/api/procurement/item-requests?includeResolved=true").then().statusCode(200).body("request.id", hasItem(radio));
        admin().body(Map.of("reason", "Again")).post("/api/procurement/item-requests/" + UUID.randomUUID() + "/decline").then().statusCode(404);
    }

    @Test void accountTransferMovesOwnedPrivateResourcesToTheSuccessor() {
        RequestSpecification leaving = actor("leaving-" + UUID.randomUUID(), "tenant");
        String leavingId = id(leaving);
        String successor = id(actor("successor-" + UUID.randomUUID(), "tenant"));
        String place = TestLocations.section(() -> leaving, Map.of("name", "Gap private shelf " + UUID.randomUUID(), "privateResource", true));
        String item = leaving.body(Map.of("name", "Gap private item", "category", "Gap", "amount", 1, "value", 0,
                "privateResource", true, "storageLocation", place)).post("/api/items").then().statusCode(200).extract().path("id");
        var overview = admin().get("/api/users/" + leavingId + "/lifecycle").then().statusCode(200).extract().jsonPath();
        String policy = overview.getString("resources.find { it.id == '" + item + "' }.policyId");
        assertNotNull(policy);

        var input = Map.of("successorId", successor, "policyIds", List.of(policy, UUID.randomUUID().toString()), "reason", "Leaves the club");
        actor("successor-x", "tenant").body(input).post("/api/users/" + leavingId + "/lifecycle/transfer").then().statusCode(403);
        admin().body(Map.of("successorId", leavingId, "policyIds", List.of(policy), "reason", "Self")).post("/api/users/" + leavingId + "/lifecycle/transfer").then().statusCode(400);
        var result = admin().body(input).post("/api/users/" + leavingId + "/lifecycle/transfer").then().statusCode(200).extract().jsonPath();
        assertEquals(List.of(policy), result.getList("transferred", String.class));
        assertEquals(1, result.getMap("blocked").size());
        admin().get("/api/access/items/" + item).then().statusCode(200).body("ownerId", equalTo(successor));
        admin().get("/api/users/" + leavingId + "/lifecycle").then().statusCode(200).body("resources.id", not(hasItem(item)));
    }

    @Test void userHistoryRecordsAccessChangesForAdminsOnly() {
        String user = id(actor("history-" + UUID.randomUUID(), "read_only"));
        int revision = admin().get("/api/users").then().statusCode(200).extract().jsonPath().getInt("find { it.id == '" + user + "' }.revision");
        admin().body(Map.of("roles", List.of("warehouse_crew"), "factions", List.of(), "revision", revision, "reason", "Joins the warehouse"))
                .patch("/api/users/" + user).then().statusCode(200);
        reader().get("/api/users/" + user + "/history").then().statusCode(403);
        var history = admin().get("/api/users/" + user + "/history").then().statusCode(200).extract().jsonPath();
        assertEquals("Joins the warehouse", history.getString("find { it.after.roles.contains('warehouse_crew') }.reason"));
        assertEquals(List.of("read_only"), history.getList("find { it.reason == 'Joins the warehouse' }.before.roles", String.class));
        assertEquals("Gap admin", history.getString("find { it.reason == 'Joins the warehouse' }.changedBy.name"));
    }

    @Test void reportJobStateIsVisibleAfterARebuildRequest() {
        admin().post("/api/reports/availability/rebuild").then().statusCode(202);
        var job = admin().get("/api/reports/availability/job").then().statusCode(200).extract().jsonPath();
        assertTrue(List.of("pending", "retry", "running", "completed").contains(job.getString("state")), job.prettify());
        assertNotNull(job.getString("requestedAt"));
        reader().get("/api/reports/availability/job").then().statusCode(403);
        admin().get("/api/reports/does-not-exist/job").then().statusCode(404);
    }

    @Test void categoriesAndStockHistoryFollowVisibilityAndMovements() {
        String publicCategory = "Gap public " + UUID.randomUUID();
        String place = TestLocations.section(EndpointGapApiTest::admin, Map.of("name", "Gap shelf " + UUID.randomUUID()));
        String item = item(publicCategory, 5, place);
        RequestSpecification owner = actor("category-owner-" + UUID.randomUUID(), "tenant");
        String privatePlace = TestLocations.section(() -> owner, Map.of("name", "Gap private " + UUID.randomUUID(), "privateResource", true));
        String privateCategory = "Gap private " + UUID.randomUUID();
        owner.body(Map.of("name", "Hidden", "category", privateCategory, "amount", 1, "value", 0, "privateResource", true,
                "storageLocation", privatePlace)).post("/api/items").then().statusCode(200);
        reader().get("/api/item-categories").then().statusCode(200).body("$", hasItem(publicCategory)).body("$", not(hasItem(privateCategory)));
        admin().get("/api/item-categories").then().statusCode(200).body("$", hasItems(publicCategory, privateCategory));

        admin().body(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 2, "eventType", "DE", "faction", "KGG"))
                .post("/api/transactions").then().statusCode(200);
        admin().body(Map.of("itemId", item, "transactionType", "added", "quantityChanged", 3, "locationId", place))
                .post("/api/transactions").then().statusCode(200);
        JsonPath history = admin().get("/api/items/" + item + "/stock-history?page=0&size=50").then().statusCode(200).extract().jsonPath();
        assertEquals(List.of(5, 5, 8), history.getList("total", Integer.class));
        assertEquals(List.of(5, 3, 6), history.getList("available", Integer.class));
        List<Long> times = history.getList("timestamp", Long.class);
        assertEquals(times.stream().sorted().toList(), times, "history is chronological");
        reader().get("/api/items/" + UUID.randomUUID() + "/stock-history").then().statusCode(404);
    }

    @Test void manualRuntimeIsLoggedAgainstTheAssetVersionAndNeverRunsBackwards() {
        String place = TestLocations.section(EndpointGapApiTest::admin, Map.of("name", "Gap runtime " + UUID.randomUUID()));
        String item = admin().body(Map.of("name", "Gap generator " + UUID.randomUUID(), "category", "Power", "trackingMode", "serialized",
                "amount", 1, "storageLocation", place, "tracksRuntime", true)).post("/api/items").then().statusCode(200).extract().path("id");
        var asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().jsonPath();
        String assetId = asset.getString("[0].id"), path = "/api/items/" + item + "/assets/" + assetId + "/runtime";
        long version = asset.getLong("[0].version");

        admin().body(Map.of("hours", 2.5, "expectedVersion", version + 1)).post(path).then().statusCode(409);
        admin().body(Map.of("hours", 2.5, "reading", 3, "expectedVersion", version)).post(path).then().statusCode(400);
        reader().body(Map.of("hours", 2.5, "expectedVersion", version)).post(path).then().statusCode(403);
        admin().body(Map.of("hours", 2.5, "expectedVersion", version, "notes", "Workshop test")).post(path).then().statusCode(200)
                .body("assetInstanceId", equalTo(assetId));
        long next = admin().get("/api/items/" + item + "/assets").then().statusCode(200)
                .body("[0].operatingHours", equalTo(2.5f)).extract().jsonPath().getLong("[0].version");
        admin().body(Map.of("reading", 1, "expectedVersion", next)).post(path).then().statusCode(400);
        admin().get(path).then().statusCode(200).body("size()", equalTo(1));
    }

    @Test void notificationSettingsAndLogoutWorkForTheCaller() {
        actor("settings", "read_only").get("/api/notifications/settings").then().statusCode(200)
                .body("ntfyTopic", nullValue()).body("webhookUrl", nullValue());
        actor("settings", "read_only").post("/api/notifications/settings/ntfy-test").then().statusCode(400);
        actor("settings", "read_only").post("/api/notifications/settings/webhook-test").then().statusCode(400);
        actor("settings", "read_only").post("/api/auth/logout").then().statusCode(204);
    }
}
