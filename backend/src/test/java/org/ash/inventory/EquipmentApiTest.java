package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class EquipmentApiTest {
    private RequestSpecification admin() { return given().contentType(ContentType.JSON).header("X-Actor-Id", "f19-admin").header("X-Actor-Role", "hq_admin"); }
    private RequestSpecification reader() { return given().contentType(ContentType.JSON).header("X-Actor-Id", "f19-reader").header("X-Actor-Role", "read_only"); }
    private String item(boolean serialized) {
        return admin().body(Map.of("sku", "F19-" + UUID.randomUUID(), "name", "F19 equipment", "category", "F19", "amount", 3, "minStock", 0, "value", 0, "trackingMode", serialized ? "serialized" : "bulk"))
                .post("/api/items").then().statusCode(200).extract().path("id");
    }
    private String event(String item, LocalDate start, int quantity) {
        return admin().body(Map.of("name", "F19 event", "eventType", "DE", "startDate", start.toString(), "endDate", start.plusDays(1).toString(), "plannedQuantities", Map.of(item, quantity)))
                .post("/api/events").then().statusCode(200).extract().path("id");
    }
    private String path(String item) { return "/api/items/" + item + "/equipment"; }
    private Map<String, Object> profile(int revision) { return new HashMap<>(Map.of("ownershipType", "private_owner", "ownerName", "Radio owner", "keeperName", "Garage keeper", "keeperContact", "Arrange pickup by phone", "availabilityPolicy", "commitment_required", "revision", revision, "reason", "Owner confirmed private equipment")); }
    private void makePrivate(String item) { admin().body(profile(0)).put(path(item)).then().statusCode(200).body("revision", equalTo(1)); }
    private Map<String, Object> offer(String event, int revision, LocalDate start) {
        var value = new HashMap<String, Object>(Map.of("quantity", 2, "revision", revision, "availableFrom", start.toString(), "availableUntil", start.plusDays(2).toString(), "pickupDetails", "Collect from keeper", "returnDue", start.plusDays(3).toString(), "returnDetails", "Return to owner", "notes", "Owner agreement recorded"));
        if (event != null) value.put("eventId", event); return value;
    }
    private Map<String, Object> checkout(String item, String event, int quantity) {
        var value = new HashMap<String, Object>(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", quantity, "eventType", "DE", "faction", "F19", "reason", "Use committed stock"));
        if (event != null) value.put("eventOccurrenceId", event); return value;
    }
    private String generalOrder(String item, String event, int quantity) {
        String id = admin().body(Map.of("name", "F19 order", "purpose", "Commitment test", "eventOccurrenceId", event, "requestedQuantities", Map.of(item, quantity)))
                .post("/api/general-orders").then().statusCode(200).extract().path("id");
        admin().body(Map.of()).post("/api/general-orders/" + id + "/submit").then().statusCode(200); return id;
    }

    @Test void ownershipDoesNotFollowVisibilityLocationOrKeeperAndReadOnlyCannotEdit() {
        String item = item(false);
        admin().get(path(item)).then().statusCode(200).body("ownershipType", equalTo("organization")).body("availabilityPolicy", equalTo("available"));
        var profile = profile(0); profile.put("ownershipType", "organization"); profile.put("availabilityPolicy", "available");
        reader().body(profile).put(path(item)).then().statusCode(403);
        admin().body(profile).put(path(item)).then().statusCode(200).body("keeperName", equalTo("Garage keeper"));
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.totalOwned", equalTo(3)).body("stock.available", equalTo(3)).body("visibilityScope", equalTo("global"));
        admin().body(profile(0)).put(path(item)).then().statusCode(409);
        admin().body(profile(1)).put(path(item)).then().statusCode(200);
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.totalOwned", equalTo(0)).body("stock.onHand", equalTo(3)).body("stock.available", equalTo(0)).body("visibilityScope", equalTo("global"));
        admin().body(checkout(item, null, 1)).post("/api/transactions").then().statusCode(409);
    }

    @Test void commitmentEnforcesEventQuantityCustodyAndRetainsCancellationEvidence() {
        String item = item(false); makePrivate(item);
        String event = event(item, LocalDate.now(), 4), other = event(item, LocalDate.now(), 0);
        reader().body(offer(event, 1, LocalDate.now())).post(path(item) + "/commitments").then().statusCode(403);
        String commitment = admin().body(offer(event, 1, LocalDate.now())).post(path(item) + "/commitments").then().statusCode(200).extract().path("commitments[0].id");
        admin().get("/api/items/" + item).then().body("stock.available", equalTo(0));
        admin().get("/api/equipment-availability?eventId=" + event).then().statusCode(200).body("'" + item + "'.available", equalTo(2));
        admin().body(checkout(item, other, 1)).post("/api/transactions").then().statusCode(409);
        admin().body(checkout(item, event, 3)).post("/api/transactions").then().statusCode(409);
        admin().body(checkout(item, event, 2)).post("/api/transactions").then().statusCode(200);
        admin().body(checkout(item, event, 1)).post("/api/transactions").then().statusCode(409);
        admin().body(Map.of("revision", 2, "reason", "Withdraw offer")).post(path(item) + "/commitments/" + commitment + "/cancel").then().statusCode(409);
        admin().body(profile(2)).put(path(item)).then().statusCode(200); // Contact-only edits remain possible.
        admin().body(Map.of("itemId", item, "transactionType", "checkin", "quantityChanged", 2, "reason", "Returned" )).post("/api/transactions").then().statusCode(200);
        admin().body(Map.of("revision", 3, "reason", "Owner withdrew offer")).post(path(item) + "/commitments/" + commitment + "/cancel").then().statusCode(200)
                .body("commitments[0].status", equalTo("cancelled")).body("commitments[0].cancellationReason", equalTo("Owner withdrew offer"));
        admin().body(checkout(item, event, 1)).post("/api/transactions").then().statusCode(409);
    }

    @Test void overlapDatesCapacityAndReturnObligationsAreValidated() {
        String item = item(false); makePrivate(item); String event = event(item, LocalDate.now(), 2);
        var offer = offer(event, 1, LocalDate.now()); offer.put("quantity", 4);
        admin().body(offer).post(path(item) + "/commitments").then().statusCode(409);
        offer.put("quantity", 2); offer.remove("returnDue");
        admin().body(offer).post(path(item) + "/commitments").then().statusCode(400);
        offer = offer(event, 1, LocalDate.now()); offer.put("availableUntil", LocalDate.now().toString());
        admin().body(offer).post(path(item) + "/commitments").then().statusCode(400);
        admin().body(offer(event, 1, LocalDate.now())).post(path(item) + "/commitments").then().statusCode(200);
        admin().body(offer(null, 2, LocalDate.now().plusDays(3))).post(path(item) + "/commitments").then().statusCode(409);
        admin().body(offer(null, 2, LocalDate.now().plusDays(4))).post(path(item) + "/commitments").then().statusCode(200);
        var changed = profile(3); changed.put("ownershipType", "organization");
        admin().body(changed).put(path(item)).then().statusCode(409);
    }

    @Test void generalReservationsShareCommitmentCapacityAndPlannerCreditsThemOnce() {
        String item = item(false); makePrivate(item); String event = event(item, LocalDate.now(), 4);
        admin().body(offer(event, 1, LocalDate.now())).post(path(item) + "/commitments").then().statusCode(200);
        String first = generalOrder(item, event, 2), second = generalOrder(item, event, 1);
        admin().body(Map.of("preparedQuantities", Map.of(item, 2))).post("/api/general-orders/" + first + "/prepare").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(item, 1))).post("/api/general-orders/" + second + "/prepare").then().statusCode(409);
        admin().get("/api/procurement/deficits?eventOccurrenceId=" + event).then().statusCode(200)
                .body("find { it.itemId == '" + item + "' }.committedStock", equalTo(2))
                .body("find { it.itemId == '" + item + "' }.netDeficit", equalTo(2));
        admin().body(Map.of()).post("/api/general-orders/" + first + "/ready").then().statusCode(200);
        admin().body(Map.of()).post("/api/general-orders/" + first + "/pickup").then().statusCode(200);
        admin().body(checkout(item, event, 1)).post("/api/transactions").then().statusCode(409);
    }

    @Test void exactAssetsAreEnforcedForDirectAndFactionOrderCheckout() {
        String item = item(true); makePrivate(item); String event = event(item, LocalDate.now(), 1);
        List<String> assets = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().jsonPath().getList("id");
        var offer = offer(event, 1, LocalDate.now()); offer.put("quantity", 1); offer.put("assetIds", List.of(assets.get(0)));
        admin().body(offer).post(path(item) + "/commitments").then().statusCode(200);
        var tx = checkout(item, event, 1); tx.put("assetInstanceId", assets.get(1));
        admin().body(tx).post("/api/transactions").then().statusCode(409);
        String order = admin().body(Map.of("eventOccurrenceId", event, "eventType", "DE", "faction", "F19", "requestedQuantities", Map.of(item, 1)))
                .post("/api/orders").then().statusCode(200).extract().path("id");
        admin().body(Map.of()).post("/api/orders/" + order + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(item, 1), "assetAssignments", Map.of(item, List.of(assets.get(1)))))
                .post("/api/orders/" + order + "/prepare").then().statusCode(409);
        admin().body(Map.of("preparedQuantities", Map.of(item, 1), "assetAssignments", Map.of(item, List.of(assets.get(0)))))
                .post("/api/orders/" + order + "/prepare").then().statusCode(200);
        admin().body(Map.of("pickupLatitude", 52.5, "pickupLongitude", 13.4)).post("/api/orders/" + order + "/transitions/ready").then().statusCode(200);
        admin().body(Map.of()).post("/api/orders/" + order + "/transitions/picked_up").then().statusCode(200);
        admin().get("/api/items/" + item).then().body("stock.totalOwned", equalTo(0)).body("stock.checkedOut", equalTo(1));
    }

    @Test void futureCommitmentAllowsPreparationButNotEarlyPickupAndDateOnlyOfferWorks() {
        String item = item(false); makePrivate(item); LocalDate start = LocalDate.now().plusDays(10);
        String event = event(item, start, 2);
        admin().body(offer(event, 1, start)).post(path(item) + "/commitments").then().statusCode(200);
        String order = generalOrder(item, event, 2);
        admin().body(Map.of("preparedQuantities", Map.of(item, 2))).post("/api/general-orders/" + order + "/prepare").then().statusCode(200);
        admin().body(Map.of()).post("/api/general-orders/" + order + "/ready").then().statusCode(200);
        admin().body(Map.of()).post("/api/general-orders/" + order + "/pickup").then().statusCode(409);
        String otherItem = item(false); makePrivate(otherItem);
        admin().body(offer(null, 1, LocalDate.now())).post(path(otherItem) + "/commitments").then().statusCode(200);
        admin().body(checkout(otherItem, null, 1)).post("/api/transactions").then().statusCode(200);
    }

    @Test void privateBulkTransferPreservesOwnershipAndReportsDoNotPromiseIt() {
        String source = admin().body(Map.of("name", "F19 garage")).post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String destination = admin().body(Map.of("name", "F19 central")).post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String item = admin().body(Map.of("sku", "F19-" + UUID.randomUUID(), "name", "Private bulk", "category", "F19", "amount", 3, "storageLocation", source))
                .post("/api/items").then().statusCode(200).extract().path("id");
        makePrivate(item);
        String transfer = admin().body(Map.of("sourceLocationId", source, "destinationLocationId", destination, "idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("itemId", item, "quantity", 2))))
                .post("/api/transfers").then().statusCode(201).extract().path("id");
        String line = admin().get("/api/transfers").then().extract().path("find { it.id == '" + transfer + "' }.lines[0].id");
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/transfers/" + transfer + "/dispatch").then().statusCode(200);
        var changingOwner = profile(1); changingOwner.put("ownerName", "Another owner");
        admin().body(changingOwner).put(path(item)).then().statusCode(409);
        admin().body(Map.of("idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("transferLineId", line, "receivedQuantity", 2, "discrepancyQuantity", 0))))
                .post("/api/transfers/" + transfer + "/receive").then().statusCode(200);
        admin().get(path(item)).then().body("ownershipType", equalTo("private_owner")).body("keeperName", equalTo("Garage keeper"));
        admin().get("/api/items/" + item).then().body("stock.onHand", equalTo(3)).body("stock.checkedOut", equalTo(0)).body("stock.totalOwned", equalTo(0));
        admin().post("/api/reports/availability/rebuild").then().statusCode(204);
        admin().get("/api/reports/availability?itemId=" + item).then().statusCode(200).body("total", equalTo(2))
                .body("rows.available", everyItem(equalTo(0))).body("rows.ownership", everyItem(equalTo("private_owner")));
        admin().body(profile(1)).put(path(item)).then().statusCode(200);
        admin().get("/api/reports/availability?itemId=" + item).then().body("stale", equalTo(true));
    }

    @Test void externalEquipmentRemainsTransferableBeforeCheckoutCommitment() {
        String source = admin().body(Map.of("name", "External equipment provider"))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String destination = admin().body(Map.of("name", "External equipment intake"))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String item = admin().body(Map.of("name", "External transferable bulk", "category", "F19", "amount", 3, "value", 0, "storageLocation", source))
                .post("/api/items").then().statusCode(200).extract().path("id");
        makePrivate(item);
        admin().queryParam("itemId", item).get("/api/inventory-positions").then().statusCode(200)
                .body("[0].availableQuantity", equalTo(0)).body("[0].transferableQuantity", equalTo(3));
        String transfer = admin().body(Map.of("sourceLocationId", source, "destinationLocationId", destination, "idempotencyKey", UUID.randomUUID().toString(),
                "lines", List.of(Map.of("itemId", item, "quantity", 2))))
                .post("/api/transfers").then().statusCode(201).extract().path("id");
        admin().body(Map.of("idempotencyKey", UUID.randomUUID().toString())).post("/api/transfers/" + transfer + "/dispatch")
                .then().statusCode(200).body("status", equalTo("in_transit"));
    }

    @Test void catalogScopeAlsoProtectsEquipmentDetailsAndAvailability() {
        String item = admin().body(Map.of("sku", "F19-" + UUID.randomUUID(), "name", "Scoped private stock", "category", "F19", "amount", 1, "visibilityScope", "group", "assignedGroup", "F19-secret"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        makePrivate(item);
        reader().get(path(item)).then().statusCode(404);
        reader().get("/api/equipment-availability").then().statusCode(200).body("containsKey('" + item + "')", equalTo(false));
    }
}
