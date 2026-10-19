package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/** Runtime-tracked units get their hours run recorded, per event, when the warehouse checks the return. */
@QuarkusTest
class RuntimeReturnApiTest {
    private RequestSpecification admin() {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "runtime-admin").header("X-Actor-Role", "admin");
    }

    /** Decimal hours arrive as int or float depending on scale; compare the value. */
    private static org.hamcrest.Matcher<Object> hours(double expected) {
        return new org.hamcrest.TypeSafeMatcher<>() {
            @Override protected boolean matchesSafely(Object value) { return value instanceof Number n && Math.abs(n.doubleValue() - expected) < 0.001; }
            @Override public void describeTo(org.hamcrest.Description description) { description.appendText(expected + " h"); }
        };
    }

    private String trackedItem() {
        String location = admin().body(Map.of("name", "Runtime " + UUID.randomUUID())).post("/api/storage-locations")
                .then().statusCode(200).extract().path("id");
        return admin().body(Map.of("name", "Runtime generator " + UUID.randomUUID(), "category", "Stromerzeuger",
                "trackingMode", "serialized", "amount", 1, "storageLocation", location, "tracksRuntime", true))
                .post("/api/items").then().statusCode(200).body("tracksRuntime", equalTo(true)).extract().path("id");
    }

    private String event() {
        return admin().body(Map.of("eventType", "DE", "name", "Runtime event " + UUID.randomUUID(), "startDate", "2039-05-01", "status", "active"))
                .post("/api/events").then().statusCode(200).extract().path("id");
    }

    private String submitReturn(String item, String asset, String event) {
        admin().body(Map.of("itemId", item, "assetInstanceId", asset, "transactionType", "checkout",
                "quantityChanged", 1, "eventType", "DE", "faction", "Runtime", "eventOccurrenceId", event))
                .post("/api/transactions").then().statusCode(200);
        var input = new HashMap<String, Object>(Map.of("itemId", item, "assetInstanceId", asset, "quantity", 1));
        if (event != null) input.put("eventOccurrenceId", event);
        return admin().body(input).post("/api/returns").then().statusCode(200)
                .body("tracksRuntime", equalTo(true)).extract().path("id");
    }

    @Test void acceptingATrackedReturnRequiresAndBooksTheHoursToTheEvent() {
        String item = trackedItem(), event = event();
        String asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
        String submission = submitReturn(item, asset, event);

        admin().body(Map.of()).post("/api/returns/" + submission + "/acknowledge").then().statusCode(400);
        admin().body(Map.of("hoursRun", 7.5, "notes", "Nachtbetrieb")).post("/api/returns/" + submission + "/acknowledge")
                .then().statusCode(200).body("status", equalTo("accepted")).body("runtimeHours", hours(7.5));

        admin().get("/api/items/" + item + "/assets").then().statusCode(200)
                .body("find { it.id == '" + asset + "' }.operatingHours", hours(7.5));
        admin().get("/api/items/" + item + "/assets/" + asset + "/runtime").then().statusCode(200)
                .body("size()", equalTo(1))
                .body("[0].eventOccurrenceId", equalTo(event))
                .body("[0].source", equalTo("return_check"))
                .body("[0].hours", hours(7.5))
                .body("[0].readingAfter", hours(7.5));
    }

    @Test void untrackedItemsAcceptReturnsWithoutHours() {
        String location = admin().body(Map.of("name", "Runtime " + UUID.randomUUID())).post("/api/storage-locations")
                .then().statusCode(200).extract().path("id");
        String item = admin().body(Map.of("name", "Untracked " + UUID.randomUUID(), "category", "Funk",
                "trackingMode", "serialized", "amount", 1, "storageLocation", location))
                .post("/api/items").then().statusCode(200).body("tracksRuntime", equalTo(false)).extract().path("id");
        String asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
        admin().body(Map.of("itemId", item, "assetInstanceId", asset, "transactionType", "checkout",
                "quantityChanged", 1, "eventType", "DE", "faction", "Runtime")).post("/api/transactions").then().statusCode(200);
        String submission = admin().body(Map.of("itemId", item, "assetInstanceId", asset, "quantity", 1))
                .post("/api/returns").then().statusCode(200).extract().path("id");
        admin().body(Map.of()).post("/api/returns/" + submission + "/acknowledge").then().statusCode(200)
                .body("runtimeHours", nullValue());
        admin().get("/api/items/" + item + "/assets/" + asset + "/runtime").then().statusCode(200).body("size()", equalTo(0));
    }

    @Test void orderReturnsBookTheReadingAgainstTheOrderEvent() {
        String item = trackedItem();
        String asset = admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("[0].id");
        String order = admin().body(Map.of("eventType", "DE", "faction", "Runtime " + UUID.randomUUID(),
                "eventDate", "2039-09-10", "requestedQuantities", Map.of(item, 1)))
                .post("/api/orders/faction").then().statusCode(200).extract().path("id");
        String event = admin().get("/api/orders/faction/" + order).then().statusCode(200).extract().path("eventOccurrenceId");
        admin().body(Map.of()).post("/api/orders/faction/" + order + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(item, 1), "assetAssignments", Map.of(item, List.of(asset)), "acknowledgeShortages", false))
                .post("/api/orders/faction/" + order + "/prepare").then().statusCode(200);
        admin().body(Map.of("pickupLatitude", 52.5, "pickupLongitude", 13.4))
                .post("/api/orders/faction/" + order + "/transitions/ready").then().statusCode(200);
        admin().body(Map.of()).post("/api/orders/faction/" + order + "/transitions/picked_up").then().statusCode(200);
        var line = Map.of(item, Map.of("returned", 1, "consumed", 0, "damaged", 0, "missing", 0));
        // A tracked unit going back to stock needs the hours run, and the meter never runs backwards.
        admin().body(Map.of("idempotencyKey", UUID.randomUUID(), "lines", line,
                        "assets", Map.of(asset, Map.of("outcome", "returned_good"))))
                .post("/api/orders/faction/" + order + "/return").then().statusCode(400);
        admin().body(Map.of("idempotencyKey", UUID.randomUUID(), "lines", line,
                        "assets", Map.of(asset, Map.of("outcome", "returned_good", "operatingHours", -1))))
                .post("/api/orders/faction/" + order + "/return").then().statusCode(400);
        admin().body(Map.of("idempotencyKey", UUID.randomUUID(), "lines", line,
                        "assets", Map.of(asset, Map.of("outcome", "returned_good", "operatingHours", 12))))
                .post("/api/orders/faction/" + order + "/return").then().statusCode(200);
        admin().get("/api/items/" + item + "/assets/" + asset + "/runtime").then().statusCode(200)
                .body("[0].eventOccurrenceId", equalTo(event))
                .body("[0].orderId", equalTo(order))
                .body("[0].hours", hours(12));
    }

    @Test void itemMeterEditsAreBookedAsCorrections() {
        String item = admin().body(Map.of("name", "Runtime pump " + UUID.randomUUID(), "category", "Pumpen",
                "tracksRuntime", true, "currentOperatingHours", 5))
                .post("/api/items").then().statusCode(200).body("currentOperatingHours", hours(5)).extract().path("id");
        admin().get("/api/items/" + item + "/runtime").then().statusCode(200)
                .body("size()", equalTo(1)).body("[0].source", equalTo("correction")).body("[0].readingAfter", hours(5));

        var update = new HashMap<String, Object>(Map.of("name", "Runtime pump", "category", "Pumpen", "tracksRuntime", true, "currentOperatingHours", 8));
        admin().body(update).patch("/api/items/" + item).then().statusCode(200).body("currentOperatingHours", hours(8));
        admin().body(update).patch("/api/items/" + item).then().statusCode(200);
        admin().get("/api/items/" + item + "/runtime").then().statusCode(200)
                .body("size()", equalTo(2)).body("source", everyItem(equalTo("correction")));

        update.put("currentOperatingHours", -1);
        admin().body(update).patch("/api/items/" + item).then().statusCode(400);
    }
}
