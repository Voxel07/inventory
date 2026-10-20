package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

/** Unused consumables (fuel) come back after pickup while their containers are returned as ordinary items. */
@QuarkusTest
class ConsumableRestockApiTest {
    private static io.restassured.specification.RequestSpecification request() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "restock-admin")
                .header("X-Actor-Name", "Restock admin")
                .header("X-Actor-Role", "admin");
    }

    private static String diesel(String location) {
        // Litres with one decimal: 1000 steps are 100.0 L.
        return request().body(Map.of("name", "Diesel " + UUID.randomUUID(), "category", "Fuel", "amount", 1000,
                        "inventoryRole", "consumable", "unit", "L", "quantityDecimals", 1, "storageLocation", location))
                .post("/api/items").then().statusCode(200)
                .body("unit", equalTo("L")).body("quantityDecimals", equalTo(1)).extract().path("id");
    }

    @Test
    void filledCanisterOrderConsumesFuelReturnsCanistersAndRestocksUnusedFuelOnce() {
        String warehouse = TestLocations.section(ConsumableRestockApiTest::request, Map.of("name", "Fuel depot " + UUID.randomUUID()));
        String site = TestLocations.section(ConsumableRestockApiTest::request, Map.of("name", "Fuel site " + UUID.randomUUID(),
                "latitude", 52.5, "longitude", 13.4, "mapZoom", 16));
        String diesel = diesel(warehouse);
        String canister = request().body(Map.of("name", "20 L canister " + UUID.randomUUID(), "category", "Fuel", "amount", 4,
                        "storageLocation", warehouse))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String filled = request().body(Map.of("name", "Filled diesel canister " + UUID.randomUUID(),
                        "itemQuantities", Map.of(canister, 1, diesel, 200)))
                .post("/api/assemblies").then().statusCode(200).extract().path("id");

        var orderBody = new HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Fuel crew");
        orderBody.put("eventDate", "2037-07-01");
        orderBody.put("requestedQuantities", Map.of());
        orderBody.put("requestedAssemblyQuantities", Map.of(filled, 2));
        String order = request().body(orderBody).post("/api/orders/faction").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/faction/" + order + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(canister, 2, diesel, 400), "acknowledgeShortages", false))
                .post("/api/orders/faction/" + order + "/prepare").then().statusCode(200);
        request().body(Map.of("pickupLocation", site)).post("/api/orders/faction/" + order + "/transitions/ready").then().statusCode(200);
        // 40 L consumed at once, 2 canisters outstanding.
        request().body(Map.of("idempotencyKey", UUID.randomUUID().toString()))
                .post("/api/orders/faction/" + order + "/transitions/picked_up").then().statusCode(200)
                .body("status", equalTo("picked_up"))
                .body("consumedQuantities.'" + diesel + "'", equalTo(400));

        // Both canisters come back with 7.5 L unused.
        request().body(Map.of("idempotencyKey", UUID.randomUUID().toString(), "lines", Map.of(canister,
                        Map.of("returned", 2, "missing", 0, "damaged", 0))))
                .post("/api/orders/faction/" + order + "/return").then().statusCode(200).body("status", equalTo("returned"));
        String restock = UUID.randomUUID().toString();
        var restockBody = Map.of("idempotencyKey", restock, "quantities", Map.of(diesel, 75));
        request().body(restockBody).post("/api/orders/faction/" + order + "/restock").then().statusCode(200)
                .body("status", equalTo("returned"))
                .body("consumedQuantities.'" + diesel + "'", equalTo(325))
                .body("returnedQuantities.'" + diesel + "'", equalTo(75));
        // A repeated submission adds nothing.
        request().body(restockBody).post("/api/orders/faction/" + order + "/restock").then().statusCode(200)
                .body("consumedQuantities.'" + diesel + "'", equalTo(325));
        request().get("/api/items/" + diesel).then().statusCode(200)
                .body("stock.onHand", equalTo(675)).body("stock.checkedOut", equalTo(0));
        request().get("/api/items/" + canister).then().statusCode(200).body("stock.onHand", equalTo(4));

        // Never more than is still consumed, also after closing.
        request().body(Map.of()).post("/api/orders/faction/" + order + "/transitions/closed").then().statusCode(200);
        request().body(Map.of("idempotencyKey", UUID.randomUUID().toString(), "quantities", Map.of(diesel, 326)))
                .post("/api/orders/faction/" + order + "/restock").then().statusCode(400);
        request().body(Map.of("idempotencyKey", UUID.randomUUID().toString(), "quantities", Map.of(canister, 1)))
                .post("/api/orders/faction/" + order + "/restock").then().statusCode(400);
        request().body(Map.of("idempotencyKey", UUID.randomUUID().toString(), "quantities", Map.of(diesel, 25)))
                .post("/api/orders/faction/" + order + "/restock").then().statusCode(200)
                .body("status", equalTo("closed")).body("consumedQuantities.'" + diesel + "'", equalTo(300));
        request().get("/api/custody-balances").then().statusCode(200)
                .body("find { it.itemId == '" + diesel + "' }", nullValue());
    }

    @Test
    void directCheckoutRestockKeepsTheIssuedLimitAndIsIdempotent() {
        String warehouse = TestLocations.section(ConsumableRestockApiTest::request, Map.of("name", "Direct fuel " + UUID.randomUUID()));
        String diesel = diesel(warehouse);
        String checkout = request().body(Map.of("itemId", diesel, "transactionType", "checkout", "quantityChanged", 400,
                        "reason", "Generator", "locationId", warehouse))
                .post("/api/transactions").then().statusCode(200).extract().path("id");
        request().queryParam("itemId", diesel).get("/api/transactions/restockable").then().statusCode(200)
                .body("size()", equalTo(1)).body("[0].checkoutId", equalTo(checkout))
                .body("[0].issued", equalTo(400)).body("[0].restocked", equalTo(0));

        String command = UUID.randomUUID().toString();
        var body = Map.of("quantity", 75, "idempotencyKey", command);
        String restock = request().body(body).post("/api/transactions/" + checkout + "/restock").then().statusCode(200)
                .body("transactionType", equalTo("checkin")).body("quantityChanged", equalTo(75)).extract().path("id");
        request().body(body).post("/api/transactions/" + checkout + "/restock").then().statusCode(200).body("id", equalTo(restock));
        request().get("/api/items/" + diesel).then().statusCode(200)
                .body("stock.onHand", equalTo(675)).body("stock.checkedOut", equalTo(0));
        request().body(Map.of("quantity", 326, "idempotencyKey", UUID.randomUUID().toString()))
                .post("/api/transactions/" + checkout + "/restock").then().statusCode(400);
        request().body(Map.of("quantity", 325, "idempotencyKey", UUID.randomUUID().toString()))
                .post("/api/transactions/" + checkout + "/restock").then().statusCode(200);
        request().queryParam("itemId", diesel).get("/api/transactions/restockable").then().statusCode(200)
                .body("size()", equalTo(0));
        request().get("/api/items/" + diesel).then().statusCode(200).body("stock.onHand", equalTo(1000));
    }

    @Test
    void decimalPlacesAreFixedOnceStockExists() {
        String warehouse = TestLocations.section(ConsumableRestockApiTest::request, Map.of("name", "Decimal fuel " + UUID.randomUUID()));
        String diesel = diesel(warehouse);
        var item = request().get("/api/items/" + diesel).then().statusCode(200).extract().jsonPath();
        request().body(Map.of("name", item.getString("name"), "category", "Fuel", "inventoryRole", "consumable",
                        "unit", "L", "quantityDecimals", 2, "storageLocation", warehouse))
                .patch("/api/items/" + diesel).then().statusCode(400);
        request().body(Map.of("name", "Serialized decimal " + UUID.randomUUID(), "category", "Test", "amount", 0,
                        "trackingMode", "serialized", "quantityDecimals", 1))
                .post("/api/items").then().statusCode(400);
    }
}
