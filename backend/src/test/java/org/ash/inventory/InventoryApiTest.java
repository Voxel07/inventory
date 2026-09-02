package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

@QuarkusTest
class InventoryApiTest {
    private static io.restassured.specification.RequestSpecification request() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "test-admin")
                .header("X-Actor-Name", "Test Admin")
                .header("X-Actor-Role", "admin");
    }

    @Test
    void catalogAndMaintenanceBlockerFlow() {
        String locationId = request()
                .body(Map.of("name", "Test Shelf", "mapZoom", 16))
                .post("/api/storage-locations")
                .then().statusCode(200).body("id", notNullValue())
                .extract().path("id");

        String itemId = request()
                .body(Map.of(
                        "sku", "TEST-001", "name", "Test Generator", "category", "Infrastructure",
                        "amount", 2, "minStock", 1, "value", 250, "storageLocation", locationId,
                        "maintenanceStatus", "certified", "nextMaintenanceDue", LocalDate.now().minusDays(1).toString()))
                .post("/api/items")
                .then().statusCode(200).body("name", equalTo("Test Generator"))
                .extract().path("id");

        request()
                .body(Map.of("itemId", itemId, "transactionType", "checkout", "quantityChanged", 1, "reason", "test"))
                .post("/api/transactions")
                .then().statusCode(409)
                .body("error", org.hamcrest.Matchers.containsString("maintenance status is overdue"));
    }
}
