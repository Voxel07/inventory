package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

/** Receipts hand all lines to inventory at once, which locks the items canonically before booking. */
@QuarkusTest
class GoodsReceiptBatchTest {
    private RequestSpecification admin() { return given().contentType(ContentType.JSON).header("X-Actor-Id", "goods-receipt-batch-admin").header("X-Actor-Role", "admin"); }
    private String serialized(String tag) {
        return admin().body(Map.of("sku", "RCPT-" + UUID.randomUUID(), "name", "Receipt batch " + tag, "category", "Receipt batch",
                "amount", 0, "trackingMode", "serialized")).post("/api/items").then().statusCode(200).extract().path("id");
    }
    private record Order(String id, String firstLine, String secondLine) {}
    private Order order(String first, String second) {
        String vendor = admin().body(Map.of("name", "Receipt batch vendor " + UUID.randomUUID())).post("/api/vendors").then().statusCode(201).extract().path("id");
        var created = admin().body(Map.of("vendorId", vendor, "orderDate", 1792540800000L, "lines", List.of(
                        Map.of("itemId", first, "orderedQuantity", 2, "unitPriceCents", 100),
                        Map.of("itemId", second, "orderedQuantity", 2, "unitPriceCents", 100))))
                .post("/api/purchase-orders").then().statusCode(201).extract().jsonPath();
        String id = created.getString("id");
        admin().body(Map.of("status", "ordered")).post("/api/purchase-orders/" + id + "/transitions").then().statusCode(200);
        return new Order(id, created.getString("lines.find { it.itemId == '" + first + "' }.id"),
                created.getString("lines.find { it.itemId == '" + second + "' }.id"));
    }
    private Map<String, Object> receipt(Order order, String location, List<String> firstCodes, List<String> secondCodes) {
        // Lines deliberately not in item-ID order.
        return Map.of("purchaseOrderId", order.id(), "receivingLocationId", location, "idempotencyKey", UUID.randomUUID().toString(),
                "lines", List.of(
                        Map.of("purchaseOrderLineId", order.secondLine(), "acceptedQuantity", secondCodes.size(), "damagedQuantity", 0, "rejectedQuantity", 0, "assetCodes", secondCodes),
                        Map.of("purchaseOrderLineId", order.firstLine(), "acceptedQuantity", firstCodes.size(), "damagedQuantity", 0, "rejectedQuantity", 0, "assetCodes", firstCodes)));
    }

    @Test void multiItemReceiptBooksEveryLine() {
        String location = TestLocations.section(this::admin, Map.of("name", "Receipt batch bay " + UUID.randomUUID()));
        String first = serialized("A"), second = serialized("B");
        String tag = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        admin().body(receipt(order(first, second), location, List.of(tag + "-A1", tag + "-A2"), List.of(tag + "-B1")))
                .post("/api/goods-receipts").then().statusCode(201).body("status", equalTo("posted"));
        admin().get("/api/items/" + first + "/assets").then().statusCode(200).body("size()", equalTo(2));
        admin().get("/api/items/" + second + "/assets").then().statusCode(200).body("size()", equalTo(1));
    }

    @Test void duplicateAssetCodeAcrossLinesIsRejectedBeforeBooking() {
        String location = TestLocations.section(this::admin, Map.of("name", "Receipt batch bay " + UUID.randomUUID()));
        String first = serialized("C"), second = serialized("D");
        String code = "RCPT-DUP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        admin().body(receipt(order(first, second), location, List.of(code), List.of(code)))
                .post("/api/goods-receipts").then().statusCode(409);
        admin().get("/api/items/" + first + "/assets").then().statusCode(200).body("size()", equalTo(0));
        admin().get("/api/items/" + second + "/assets").then().statusCode(200).body("size()", equalTo(0));
    }
}
