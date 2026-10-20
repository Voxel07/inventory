package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

@QuarkusTest
class ItemCheckoutApiTest {
    private static io.restassured.specification.RequestSpecification request() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "item-checkout-admin")
                .header("X-Actor-Name", "Item checkout admin")
                .header("X-Actor-Role", "admin");
    }

    @Test
    void generalCheckoutOfAllFiveUnitsFromSelectedSource() {
        String location = TestLocations.section(ItemCheckoutApiTest::request,
                Map.of("name", "Checkout source " + UUID.randomUUID()));
        String item = request().body(Map.of("name", "General checkout " + UUID.randomUUID(),
                "category", "Test", "amount", 5, "storageLocation", location))
                .post("/api/items").then().statusCode(200).body("minStock", equalTo(0)).extract().path("id");
        UUID command = UUID.randomUUID();
        var checkout = Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 5,
                "reason", "Testing", "locationId", location, "idempotencyKey", command.toString());
        String transaction = request().body(checkout).post("/api/transactions").then().statusCode(200)
                .body("quantityChanged", equalTo(5)).extract().path("id");
        request().body(checkout).post("/api/transactions").then().statusCode(200).body("id", equalTo(transaction));
        request().get("/api/items/" + item).then().statusCode(200)
                .body("stock.onHand", equalTo(0)).body("stock.checkedOut", equalTo(5));
    }

    @Test
    void boxRemainderFollowsIndividualCheckoutsWholeBoxesReturnsAndRestocking() {
        String location = TestLocations.section(ItemCheckoutApiTest::request,
                Map.of("name", "Box source " + UUID.randomUUID()));
        // Five full boxes of 200, plus an opened box containing 37 screws.
        String item = request().body(Map.of("name", "Screws " + UUID.randomUUID(), "category", "Test",
                "amount", 1037, "containerSize", 200, "storageLocation", location))
                .post("/api/items").then().statusCode(200)
                .body("stock.onHand", equalTo(1037)).body("containerCount", equalTo(5))
                .body("containerRemainingCount", equalTo(37)).extract().path("id");
        transact(item, location, "checkout", 20, 200);
        assertBoxes(item, 1017, 5, 17);
        transact(item, location, "checkout", 200, 200);
        assertBoxes(item, 817, 4, 17);
        transact(item, location, "checkout", 30, 200);
        assertBoxes(item, 787, 3, 187);
        transact(item, location, "checkin", 20, 200);
        assertBoxes(item, 807, 4, 7);
        transact(item, location, "added", 200, 200);
        assertBoxes(item, 1007, 5, 7);
        transact(item, location, "checkout", 1008, 409);
        assertBoxes(item, 1007, 5, 7);
        transact(item, location, "checkout", 1007, 200);
        assertBoxes(item, 0, 0, 0);
    }

    @Test
    void openedBoxCanBeTheOnlyOpeningStock() {
        String item = request().body(Map.of("name", "Open box only " + UUID.randomUUID(), "category", "Test",
                "amount", 25, "containerSize", 200))
                .post("/api/items").then().statusCode(200).extract().path("id");
        assertBoxes(item, 25, 0, 25);
        request().body(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 20,
                "reason", "Testing"))
                .post("/api/transactions").then().statusCode(200);
        assertBoxes(item, 5, 0, 5);
    }

    @Test
    void invalidBoxSizesAreRejectedAsBadRequests() {
        for (double size : new double[] {0, -1, 1.5}) {
            request().body(Map.of("name", "Invalid box " + UUID.randomUUID(), "category", "Test",
                    "amount", 5, "containerSize", size))
                    .post("/api/items").then().statusCode(400);
        }
        request().body(Map.of("name", "Serialized box " + UUID.randomUUID(), "category", "Test",
                "amount", 5, "containerSize", 200, "trackingMode", "serialized"))
                .post("/api/items").then().statusCode(400);
    }

    private void transact(String item, String location, String type, int quantity, int expectedStatus) {
        request().body(Map.of("itemId", item, "transactionType", type, "quantityChanged", quantity,
                "reason", "Testing", "locationId", location))
                .post("/api/transactions").then().statusCode(expectedStatus);
    }

    private void assertBoxes(String item, int units, int boxes, int remainder) {
        request().get("/api/items/" + item).then().statusCode(200)
                .body("stock.onHand", equalTo(units)).body("containerCount", equalTo(boxes))
                .body("containerRemainingCount", equalTo(remainder));
    }
}
