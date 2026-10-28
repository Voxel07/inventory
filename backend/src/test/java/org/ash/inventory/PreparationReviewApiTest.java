package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.operations.internal.model.*;
import org.ash.inventory.platform.api.EpochTime;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Supplier;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
class PreparationReviewApiTest {
    @Inject EntityManager em;
    private RequestSpecification who(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", name).header("X-Actor-Name", name).header("X-Actor-Role", role);
    }
    private RequestSpecification admin() { return who("review-admin", "admin"); }
    private String place(Supplier<RequestSpecification> actor) {
        return TestLocations.section(actor, Map.of("name", "Review " + UUID.randomUUID()));
    }
    private String item(Supplier<RequestSpecification> actor, int amount, String place, String mode) {
        var body = new HashMap<String, Object>(Map.of("name", "Review " + UUID.randomUUID(), "category", "Review", "amount", amount, "trackingMode", mode));
        if (place != null) body.put("storageLocation", place);
        return actor.get().body(body).post("/api/items").then().statusCode(200).extract().path("id");
    }
    private void add(String item, int quantity, String place, String lot) {
        var body = new HashMap<String, Object>(Map.of("itemId", item, "transactionType", "added", "quantityChanged", quantity, "locationId", place));
        if (lot != null) body.put("lotId", lot);
        admin().body(body).post("/api/transactions").then().statusCode(200);
    }
    private String general(String item, int quantity, String event) {
        var body = new HashMap<String, Object>(Map.of("name", "Review order", "purpose", "Regression", "requestedQuantities", Map.of(item, quantity)));
        if (event != null) body.put("eventOccurrenceId", event);
        String id = admin().body(body).post("/api/orders/general").then().statusCode(200).extract().path("id");
        admin().body(Map.of()).post("/api/orders/general/" + id + "/transitions/submitted").then().statusCode(200);
        return id;
    }
    private void pickup(String path) {
        admin().body(Map.of("pickupLatitude", 50.0, "pickupLongitude", 8.0)).post(path + "/transitions/ready").then().log().ifValidationFails().statusCode(200);
        admin().body(Map.of()).post(path + "/transitions/picked_up").then().statusCode(200);
    }
    private Map<String, Object> action(String type, Map<String, Object> payload) {
        return Map.of("idempotencyKey", UUID.randomUUID(), "type", type, "payload", payload);
    }
    private void sync(Supplier<RequestSpecification> actor, String type, Map<String, Object> payload, String status) {
        actor.get().body(Map.of("actions", List.of(action(type, payload)))).post("/api/sync").then()
                .log().ifValidationFails().statusCode(200).body("results[0].status", equalTo(status));
    }

    @Test void mixedStoredAndUnlocatedStockReservesAndIssuesWithoutDoubleAllocation() {
        String shelf = place(this::admin), item = item(this::admin, 5, null, "bulk");
        add(item, 3, shelf, null);
        String order = general(item, 6, null), path = "/api/orders/general/" + order;
        admin().body(Map.of("preparedQuantities", Map.of(item, 6))).post(path + "/prepare").then()
                .statusCode(200).body("preparedQuantities.'" + item + "'", equalTo(6));
        String other = general(item, 3, null);
        admin().body(Map.of("preparedQuantities", Map.of(item, 3))).post("/api/orders/general/" + other + "/prepare").then().statusCode(409);
        pickup(path);
        admin().get("/api/items/" + item).then().body("stock.onHand", equalTo(2)).body("stock.checkedOut", equalTo(6));
        admin().queryParam("itemId", item).get("/api/inventory-positions").then().body("[0].quantityOnHand", equalTo(0));
    }

    @Test void acknowledgedFactionShortageUsesOnlyInternalStock() {
        String provider = place(this::admin), internal = place(this::admin), item = item(this::admin, 4, provider, "bulk");
        add(item, 2, internal, null);
        QuarkusTransaction.requiringNew().run(() -> {
            var stock = em.find(Item.class, UUID.fromString(item));
            var commitment = new EquipmentCommitment(); commitment.item = stock; commitment.quantity = 6;
            commitment.availableFrom = LocalDate.now(); commitment.availableUntil = LocalDate.now().plusDays(2);
            commitment.pickupDetails = "Provider"; commitment.notes = "Synthetic loan"; commitment.recordedBy = stock.responsiblePerson;
            em.persist(commitment);
            var loan = new LoanArrangement(); loan.commitment = commitment; loan.providerLocation = em.find(StorageLocation.class, UUID.fromString(provider));
            loan.kind = "borrow"; loan.provider = "Test provider"; loan.contact = "Test"; loan.terms = "Synthetic regression"; loan.collected = 2;
            em.persist(loan);
        });
        String order = admin().body(Map.of("eventType", "LS", "faction", "Review " + UUID.randomUUID(), "eventDate", EpochTime.millis(LocalDate.now()),
                "requestedQuantities", Map.of(item, 6))).post("/api/orders/faction").then().statusCode(200).extract().path("id");
        String path = "/api/orders/faction/" + order;
        admin().body(Map.of()).post(path + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(item, 6))).post(path + "/prepare").then().statusCode(409);
        admin().body(Map.of("preparedQuantities", Map.of(item, 6), "acknowledgeShortages", true)).post(path + "/prepare").then()
                .statusCode(200).body("preparedQuantities.'" + item + "'", equalTo(2));
        pickup(path);
        admin().queryParam("itemId", item).queryParam("locationId", provider).get("/api/inventory-positions").then().body("[0].quantityOnHand", equalTo(4));
    }

    @Test void automaticFefoSkipsReadOnlyPlacesButExplicitSelectionFails() {
        Supplier<RequestSpecification> worker = () -> who("review-worker", "warehouse_crew");
        worker.get().get("/api/access/people").then().statusCode(200);
        String person = admin().get("/api/access/people").then().extract().jsonPath().getString("find { it.name == 'review-worker' }.id");
        Supplier<RequestSpecification> owner = () -> who("review-place-owner", "tenant");
        String hidden = place(owner), usable = place(this::admin), item = item(this::admin, 0, usable, "lot_tracked");
        owner.get().body(Map.of("revision", 0, "grants", List.of(Map.of("userId", person, "canEdit", false))))
                .put("/api/access/storage-locations/" + hidden).then().statusCode(200);
        String early = admin().body(Map.of("itemId", item, "lotNumber", "Early", "expiryDate", 1893456000000L)).post("/api/inventory-lots").then().statusCode(201).extract().path("id");
        String late = admin().body(Map.of("itemId", item, "lotNumber", "Late", "expiryDate", 1956528000000L)).post("/api/inventory-lots").then().statusCode(201).extract().path("id");
        add(item, 4, hidden, early); add(item, 2, usable, late);
        String position = admin().queryParam("itemId", item).queryParam("locationId", hidden).get("/api/inventory-positions").then().extract().path("[0].id");
        String order = general(item, 2, null), path = "/api/orders/general/" + order + "/prepare";
        worker.get().body(Map.of("preparedQuantities", Map.of(item, 2), "sourceAllocations", Map.of(item, Map.of(position, 2))))
                .post(path).then().statusCode(404);
        worker.get().body(Map.of("preparedQuantities", Map.of(item, 2))).post(path).then().statusCode(200)
                .body("preparedQuantities.'" + item + "'", equalTo(2));
        pickup("/api/orders/general/" + order);
        admin().queryParam("itemId", item).queryParam("locationId", hidden).get("/api/inventory-positions").then().body("[0].quantityOnHand", equalTo(4));
    }

    @Test void pickupRecordsEventSpecificAvailabilityBeforeMovement() {
        String item = item(this::admin, 5, place(this::admin), "bulk");
        admin().body(Map.of("ownershipType", "private_owner", "ownerName", "Provider", "availabilityPolicy", "commitment_required", "revision", 0, "reason", "Regression"))
                .put("/api/items/" + item + "/equipment").then().statusCode(200);
        String event = admin().body(Map.of("name", "Review event", "eventType", "DE", "startDate", EpochTime.millis(LocalDate.now()),
                "endDate", EpochTime.millis(LocalDate.now().plusDays(1)))).post("/api/events").then().statusCode(200).extract().path("id");
        admin().body(Map.of("eventId", event, "quantity", 2, "availableFrom", EpochTime.millis(LocalDate.now()), "availableUntil", EpochTime.millis(LocalDate.now().plusDays(2)),
                "returnDue", EpochTime.millis(LocalDate.now().plusDays(3)), "pickupDetails", "Test", "returnDetails", "Test", "notes", "Test", "revision", 1))
                .post("/api/items/" + item + "/equipment/commitments").then().statusCode(200);
        String order = general(item, 1, event), path = "/api/orders/general/" + order;
        admin().body(Map.of("preparedQuantities", Map.of(item, 1))).post(path + "/prepare").then().statusCode(200);
        pickup(path);
        int before = QuarkusTransaction.requiringNew().call(() -> em.createQuery("select t.availabilityBefore from StockTransaction t where t.order.id = :order and t.type = checkout", Integer.class)
                .setParameter("order", UUID.fromString(order)).getSingleResult());
        assertEquals(2, before);
    }

    @Test void tenantSyncCannotMutateOrganizationResources() {
        String source = place(this::admin), destination = place(this::admin), item = item(this::admin, 4, source, "bulk");
        var count = admin().body(Map.of("itemId", item, "locationId", source)).post("/api/inventory-counts").then().statusCode(201).extract().jsonPath();
        var transfer = admin().body(Map.of("sourceLocationId", source, "destinationLocationId", destination, "idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("itemId", item, "quantity", 1)))).post("/api/transfers").then().statusCode(201).extract().jsonPath();
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/transfers/" + transfer.getString("id") + "/dispatch").then().statusCode(200);
        admin().body(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 1, "locationId", source)).post("/api/transactions").then().statusCode(200);
        String returned = admin().body(Map.of("itemId", item, "quantity", 1)).post("/api/returns").then().statusCode(200).extract().path("id");
        Supplier<RequestSpecification> tenant = () -> who("review-sync-org-outsider", "tenant");
        sync(tenant, "transaction", Map.of("itemId", item, "transactionType", "added", "quantityChanged", 1, "locationId", source), "rejected");
        var counted = Map.<String, Object>of("countId", count.getString("id"), "input", Map.of("lines", List.of(Map.of("lineId", count.getString("lines[0].id"), "quantity", 4))));
        sync(tenant, "count.submit", counted, "rejected"); sync(tenant, "count.recount", counted, "rejected");
        sync(tenant, "transfer.receive", Map.of("transferId", transfer.getString("id"), "input", Map.of("idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("transferLineId", transfer.getString("lines[0].id"), "receivedQuantity", 1, "discrepancyQuantity", 0)))), "rejected");
        sync(tenant, "return.accept", Map.of("returnId", returned, "input", Map.of()), "rejected");
        admin().get("/api/items/" + item).then().body("stock.onHand", equalTo(2)).body("stock.checkedOut", equalTo(1));
    }

    @Test void tenantSyncAllowsPrivateHandlersAndRejectsEveryOtherActionType() {
        Supplier<RequestSpecification> owner = () -> who("review-sync-owner", "tenant");
        String source = place(owner), destination = place(owner), item = item(owner, 4, source, "bulk");
        var transfer = owner.get().body(Map.of("sourceLocationId", source, "destinationLocationId", destination, "idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("itemId", item, "quantity", 1)))).post("/api/transfers").then().statusCode(201).extract().jsonPath();
        String transferId = transfer.getString("id");
        owner.get().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/transfers/" + transferId + "/dispatch").then().statusCode(200);
        sync(owner, "transfer.receive", Map.of("transferId", transferId, "input", Map.of("idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("transferLineId", transfer.getString("lines[0].id"), "receivedQuantity", 1, "discrepancyQuantity", 0)))), "applied");
        var count = owner.get().body(Map.of("itemId", item, "locationId", source)).post("/api/inventory-counts").then().statusCode(201).extract().jsonPath();
        String countId = count.getString("id");
        var countInput = Map.<String, Object>of("countId", countId, "input", Map.of("lines", List.of(Map.of("lineId", count.getString("lines[0].id"), "quantity", 1))));
        sync(owner, "count.submit", countInput, "applied"); sync(owner, "count.recount", countInput, "applied");
        owner.get().body(Map.of()).post("/api/inventory-counts/" + countId + "/approve").then().statusCode(200);
        owner.get().body(Map.of()).post("/api/inventory-counts/" + countId + "/post").then().statusCode(200);
        sync(owner, "transaction", Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 1, "locationId", source), "applied");
        String returned = owner.get().body(Map.of("itemId", item, "quantity", 1)).post("/api/returns").then().statusCode(200).extract().path("id");
        sync(owner, "return.accept", Map.of("returnId", returned, "input", Map.of()), "applied");
        owner.get().get("/api/items/" + item).then().body("stock.checkedOut", equalTo(0)).body("stock.onHand", equalTo(2));
        for (String type : List.of("order.create", "order.prepare", "order.transition", "order.return", "damage.create", "member.return", "unknown.future.action"))
            sync(owner, type, Map.of(), "rejected");
        Supplier<RequestSpecification> outsider = () -> who("review-sync-outsider", "tenant");
        sync(outsider, "transaction", Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 1), "rejected");
        sync(outsider, "count.submit", countInput, "rejected"); sync(outsider, "count.recount", countInput, "rejected");
        sync(outsider, "transfer.receive", Map.of("transferId", transferId, "input", Map.of("idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("transferLineId", transfer.getString("lines[0].id"), "receivedQuantity", 1, "discrepancyQuantity", 0)))), "rejected");
        sync(outsider, "return.accept", Map.of("returnId", returned, "input", Map.of()), "rejected");
    }
}
