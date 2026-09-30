package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.UserAccount;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
class PriorityRefactorApiTest {
    @Inject EntityManager em;

    private RequestSpecification actor(String id, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", id).header("X-Actor-Role", role);
    }
    private RequestSpecification admin() { return actor("priority-admin", "hq_admin"); }
    private String location() {
        return admin().body(Map.of("name", "Priority " + UUID.randomUUID())).post("/api/storage-locations")
                .then().statusCode(200).extract().path("id");
    }
    private String item(String location, int amount) {
        return admin().body(Map.of("sku", "PRIORITY-" + UUID.randomUUID(), "name", "Priority asset",
                "category", "Priority", "trackingMode", "serialized", "amount", amount,
                "storageLocation", location)).post("/api/items").then().statusCode(200).extract().path("id");
    }
    private String asset(String item) {
        return admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
    }
    private void transact(String item, String asset, String type) {
        admin().body(Map.of("itemId", item, "assetInstanceId", asset, "transactionType", type,
                "quantityChanged", 1, "eventType", "DE", "faction", "Priority"))
                .post("/api/transactions").then().statusCode(200);
    }
    private String approvedCount(String item, int observed) {
        var count = admin().body(Map.of("itemId", item)).post("/api/inventory-counts")
                .then().statusCode(201).extract().jsonPath();
        String id = count.getString("id");
        List<String> lineIds = count.getList("lines.id");
        var input = Map.of("lines", lineIds.stream().map(line -> Map.of("lineId", line, "quantity", observed)).toList());
        admin().body(Map.of()).post("/api/inventory-counts/" + id + "/start").then().statusCode(200);
        String status = admin().body(input).post("/api/inventory-counts/" + id + "/submit").then().statusCode(200).extract().path("status");
        if ("awaiting_recount".equals(status)) admin().body(input).post("/api/inventory-counts/" + id + "/recount").then().statusCode(200);
        actor("priority-approver", "hq_admin").body(Map.of()).post("/api/inventory-counts/" + id + "/approve")
                .then().statusCode(200).body("status", equalTo("approved"));
        return id;
    }
    private void post(String count, int status) {
        admin().body(Map.of()).post("/api/inventory-counts/" + count + "/post").then().statusCode(status);
    }
    private String submitReturn(String item, String asset, String order) {
        var input = new java.util.HashMap<String, Object>();
        input.put("itemId", item); input.put("assetInstanceId", asset); input.put("quantity", 1);
        if (order != null) input.put("factionOrderId", order);
        return admin().body(input).post("/api/returns").then().statusCode(200).extract().path("id");
    }
    private void reject(String submission) {
        admin().body(Map.of("notes", "Rejected after reviewing current custody"))
                .post("/api/returns/" + submission + "/reject").then().statusCode(200)
                .body("status", equalTo("rejected"))
                .body("acknowledgementNotes", equalTo("Rejected after reviewing current custody"));
    }
    private void state(String item, String asset, String expected) {
        admin().get("/api/items/" + item + "/assets").then().statusCode(200)
                .body("find { it.id == '" + asset + "' }.availabilityStatus", equalTo(expected));
    }
    private void noAdjustments(String count) {
        QuarkusTransaction.requiringNew().run(() -> assertEquals(0L, em.createQuery(
                "select count(t) from StockTransaction t where t.relatedEntityType = 'inventory_count' and t.relatedEntityId = :id", Long.class)
                .setParameter("id", UUID.fromString(count)).getSingleResult()));
    }

    @Test void privateAssembliesAreScopedOnRepeatedListsDetailsAndCommands() {
        String ownerId = actor("priority-owner", "faction_leader").get("/api/auth/me")
                .then().statusCode(200).extract().path("id");
        QuarkusTransaction.requiringNew().run(() -> em.find(UserAccount.class, UUID.fromString(ownerId)).factions = List.of("Priority", "Secret"));
        String person = admin().body(Map.of("sku", "PERSON-" + UUID.randomUUID(), "name", "Private component",
                "category", "Priority", "amount", 1, "visibilityScope", "person", "assignedUserId", ownerId))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String group = admin().body(Map.of("sku", "GROUP-" + UUID.randomUUID(), "name", "Group component",
                "category", "Priority", "amount", 1, "visibilityScope", "group", "assignedGroup", "Secret"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String assembly = admin().body(Map.of("name", "Private assembly", "itemQuantities", Map.of(person, 1, group, 1)))
                .post("/api/assemblies").then().statusCode(200).extract().path("id");
        for (int pass = 0; pass < 2; pass++) {
            admin().get("/api/assemblies").then().statusCode(200).body("id", hasItem(assembly));
            actor("priority-owner", "read_only").get("/api/assemblies").then().statusCode(200).body("id", hasItem(assembly));
            actor("priority-unrelated", "read_only").get("/api/assemblies").then().statusCode(200).body("id", not(hasItem(assembly)));
            actor("priority-unrelated", "read_only").get("/api/assemblies/" + assembly).then().statusCode(404);
            actor("priority-owner", "read_only").get("/api/assemblies/" + assembly).then().statusCode(200)
                    .body("expand.itemIds.id", hasItems(person, group));
        }
        String order = actor("priority-owner", "faction_leader").body(Map.of("eventType", "DE", "faction", "Priority",
                "eventDate", "2039-09-10", "requestedAssemblyQuantities", Map.of(assembly, 1)))
                .post("/api/orders").then().statusCode(200).extract().path("id");
        admin().body(Map.of("name", "Private component", "category", "Priority", "visibilityScope", "group", "assignedGroup", "Other"))
                .patch("/api/items/" + person).then().statusCode(200);
        actor("priority-owner", "faction_leader").get("/api/orders/" + order).then().statusCode(200)
                .body("expand.assemblyIds.id", not(hasItem(assembly))).body("expand.itemIds.id", not(hasItem(person)));
        actor("priority-owner", "faction_leader").body(Map.of("eventType", "DE", "faction", "Priority",
                "eventDate", "2039-09-10", "requestedAssemblyQuantities", Map.of(assembly, 1)))
                .post("/api/orders").then().statusCode(404);
    }

    @Test void unchangedSerializedCountsPostZeroAndOneObservations() {
        for (int observed : List.of(0, 1)) {
            String item = item(location(), 1), asset = asset(item);
            post(approvedCount(item, observed), 200);
            state(item, asset, observed == 0 ? "lost" : "available");
        }
    }

    @Test void countCannotReplaceCustodyEvenAfterAnAssetReturnsToItsOriginalState() {
        String item = item(location(), 1), asset = asset(item), count = approvedCount(item, 0);
        transact(item, asset, "checkout");
        post(count, 409); state(item, asset, "in_field");
        transact(item, asset, "checkin");
        post(count, 409); state(item, asset, "available");
        noAdjustments(count);
    }

    @Test void relocatedCountRollsBackEveryLine() {
        String item = item(location(), 2), count = approvedCount(item, 0);
        var orderedAssets = QuarkusTransaction.requiringNew().call(() -> em.createQuery(
                "select l.assetInstance.id from InventoryCountLine l where l.session.id = :id order by l.item.id, l.id", UUID.class)
                .setParameter("id", UUID.fromString(count)).getResultList());
        String moved = orderedAssets.getLast().toString();
        long version = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract()
                .jsonPath().getLong("find { it.id == '" + moved + "' }.version");
        admin().body(Map.of("locationId", location(), "expectedVersion", version))
                .post("/api/items/" + item + "/assets/" + moved + "/relocate").then().statusCode(200);
        post(count, 409);
        admin().get("/api/items/" + item + "/assets").then().statusCode(200)
                .body("availabilityStatus", everyItem(equalTo("available")));
        admin().get("/api/inventory-counts").then().statusCode(200)
                .body("find { it.id == '" + count + "' }.status", equalTo("approved"));
        noAdjustments(count);
    }

    @Test void ordinaryDirectRejectionRestoresOutstandingCustody() {
        String item = item(location(), 1), asset = asset(item);
        transact(item, asset, "checkout");
        String submission = submitReturn(item, asset, null);
        state(item, asset, "returned_pending_check");
        reject(submission); state(item, asset, "in_field");
    }

    @Test void staleDirectRejectionPreservesIndependentReturn() {
        String item = item(location(), 1), asset = asset(item);
        transact(item, asset, "checkout");
        String submission = submitReturn(item, asset, null);
        transact(item, asset, "checkin");
        reject(submission); state(item, asset, "available");
    }

    @Test void concurrentReturnDecisionsCommitExactlyOneOutcome() throws Exception {
        String item = item(location(), 1), asset = asset(item);
        transact(item, asset, "checkout");
        String submission = submitReturn(item, asset, null);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var decisions = List.of("acknowledge", "reject").stream().map(action -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Decision start timed out");
                return admin().body(Map.of("notes", action)).post("/api/returns/" + submission + "/" + action).statusCode();
            })).toList();
            if (!ready.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Decision workers timed out");
            start.countDown();
            assertEquals(List.of(200, 409), List.of(decisions.get(0).get(10, TimeUnit.SECONDS),
                    decisions.get(1).get(10, TimeUnit.SECONDS)).stream().sorted().toList());
        }
        String status = admin().get("/api/returns").then().statusCode(200).extract()
                .path("find { it.id == '" + submission + "' }.status");
        state(item, asset, "accepted".equals(status) ? "available" : "in_field");
        QuarkusTransaction.requiringNew().run(() -> assertEquals(1L, em.createQuery(
                "select count(e) from DomainEvent e where e.aggregateId = :id and e.eventType in ('return.accepted', 'return.rejected')", Long.class)
                .setParameter("id", UUID.fromString(submission)).getSingleResult()));
    }

    @Test void factionRejectionRestoresOnlyUnreconciledAssets() {
        for (boolean reconcile : List.of(false, true)) {
            String item = item(location(), 1), asset = asset(item);
            String order = admin().body(Map.of("eventType", "DE", "faction", "Priority " + UUID.randomUUID(),
                    "eventDate", "2039-09-10", "requestedQuantities", Map.of(item, 1)))
                    .post("/api/orders").then().statusCode(200).extract().path("id");
            admin().body(Map.of()).post("/api/orders/" + order + "/transitions/submitted").then().statusCode(200);
            admin().body(Map.of("preparedQuantities", Map.of(item, 1), "assetAssignments", Map.of(item, List.of(asset)), "acknowledgeShortages", false))
                    .post("/api/orders/" + order + "/prepare").then().statusCode(200);
            admin().body(Map.of("pickupLatitude", 52.5, "pickupLongitude", 13.4))
                    .post("/api/orders/" + order + "/transitions/ready").then().statusCode(200);
            admin().body(Map.of()).post("/api/orders/" + order + "/transitions/picked_up").then().statusCode(200);
            String submission = submitReturn(item, asset, order);
            if (reconcile) admin().body(Map.of("idempotencyKey", UUID.randomUUID(),
                    "lines", Map.of(item, Map.of("returned", 1, "consumed", 0, "damaged", 0, "missing", 0)),
                    "assets", Map.of(asset, Map.of("outcome", "returned_good"))))
                    .post("/api/orders/" + order + "/return").then().statusCode(200);
            reject(submission); state(item, asset, reconcile ? "available" : "in_field");
        }
    }

    @Test void bulkCountCannotRemoveStockReservedByGeneralOrders() {
        String item = admin().body(Map.of("sku", "BULK-" + UUID.randomUUID(), "name", "Reserved bulk",
                "category", "Priority", "amount", 3, "storageLocation", location()))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String event = admin().body(Map.of("eventType", "DE", "startDate", "2039-09-11", "endDate", "2039-09-12"))
                .post("/api/events").then().statusCode(200).extract().path("id");
        String count = approvedCount(item, 1);
        String order = admin().body(Map.of("name", "Reserved bulk order", "purpose", "Count safety",
                "eventOccurrenceId", event, "requestedQuantities", Map.of(item, 2)))
                .post("/api/general-orders").then().statusCode(200).extract().path("id");
        admin().body(Map.of()).post("/api/general-orders/" + order + "/submit").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(item, 2)))
                .post("/api/general-orders/" + order + "/prepare").then().statusCode(200);
        post(count, 409);
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.onHand", equalTo(3));
        noAdjustments(count);
    }
}
