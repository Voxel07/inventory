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
    @Test
    void uploadedImagesAreNamedForTheItemAndServedWithoutRedirects() {
        byte[] bytes = java.util.Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
        String first = given().header("X-Actor-Id", "media-admin")
                .multiPart("file", "image.webp", bytes, "image/webp")
                .post("/api/media").then().statusCode(200).extract().path("key");
        String second = given().header("X-Actor-Id", "media-admin")
                .multiPart("file", "image.webp", bytes, "image/webp")
                .post("/api/media").then().statusCode(200).extract().path("key");
        var item = request().body(Map.of("name", "Image test", "category", "Equipment", "value", 0,
                        "images", java.util.List.of(first, second)))
                .post("/api/items").then().statusCode(200).extract().jsonPath();
        String id = item.getString("id");
        java.util.List<String> images = item.getList("images", String.class);
        org.junit.jupiter.api.Assertions.assertEquals(2, images.size());
        org.junit.jupiter.api.Assertions.assertNotEquals(images.get(0), images.get(1));
        for (String key : images) {
            org.junit.jupiter.api.Assertions.assertTrue(key.matches("items/[0-9a-f-]{36}/" + id + "\\.webp"));
            byte[] served = request().get("/api/media/" + key).then().statusCode(200)
                    .contentType("image/webp").header("Cache-Control", "private, max-age=3600")
                    .extract().asByteArray();
            org.junit.jupiter.api.Assertions.assertArrayEquals(bytes, served);
        }
        request().get("/api/media/" + first).then().statusCode(404);
        request().get("/api/media/" + second).then().statusCode(404);
        request().body(Map.of("name", "Image test", "category", "Equipment", "value", 0,
                        "images", java.util.List.of(images.get(1))))
                .patch("/api/items/" + id).then().statusCode(200)
                .body("images[0]", equalTo(images.get(1))).body("images.size()", equalTo(1));
    }

    @Test
    void failedImageAttachmentKeepsTheUploadForRetry() {
        String staged = given().header("X-Actor-Id", "media-admin")
                .multiPart("file", "image.webp", new byte[]{1, 2, 3}, "image/webp")
                .post("/api/media").then().statusCode(200).extract().path("key");
        String missing = "2026-00000000-0000-0000-0000-000000000000-image.webp";
        request().body(Map.of("name", "Failed images", "category", "Equipment", "value", 0,
                        "images", java.util.List.of(staged, missing)))
                .post("/api/items").then().statusCode(404);
        request().get("/api/media/" + staged).then().statusCode(200);
        request().body(Map.of("name", "Retried images", "category", "Equipment", "value", 0,
                        "images", java.util.List.of(staged)))
                .post("/api/items").then().statusCode(200).body("images.size()", equalTo(1));
        request().get("/api/media/" + staged).then().statusCode(404);
    }

    private static io.restassured.specification.RequestSpecification request() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "test-admin")
                .header("X-Actor-Name", "Test Admin")
                .header("X-Actor-Role", "admin");
    }

    private static io.restassured.specification.RequestSpecification factionLeaderRequest() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "test-faction-leader")
                .header("X-Actor-Name", "Test Faction Leader")
                .header("X-Actor-Role", "faction_leader");
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

        factionLeaderRequest()
                .get("/api/transactions?itemId=" + itemId)
                .then().statusCode(200)
                .body("size()", equalTo(1))
                .body("[0].transactionType", equalTo("added"))
                .body("[0].quantityChanged", equalTo(2))
                .body("[0].reason", equalTo("Initial stock"));

        request()
                .body(Map.of("itemId", itemId, "transactionType", "checkout", "quantityChanged", 1, "reason", "test"))
                .post("/api/transactions")
                .then().statusCode(409)
                .body("error", org.hamcrest.Matchers.containsString("maintenance status is overdue"));
    }

    @Test
    void everyAuthenticatedUserCanCreateAGeneralOrder() {
        factionLeaderRequest()
                .body(Map.of("name", "Sponsor tent", "purpose", "Provide a covered sponsor area"))
                .post("/api/general-orders")
                .then().statusCode(200)
                .body("name", equalTo("Sponsor tent"))
                .body("purpose", equalTo("Provide a covered sponsor area"))
                .body("createdBy", notNullValue())
                .body("expand.createdBy.name", equalTo("Test Faction Leader"));

        factionLeaderRequest()
                .get("/api/general-orders")
                .then().statusCode(200)
                .body("[0].name", equalTo("Sponsor tent"));
    }
}
