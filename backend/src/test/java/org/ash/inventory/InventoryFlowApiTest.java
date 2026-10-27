package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;
import java.util.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class InventoryFlowApiTest {
    private RequestSpecification request() {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "flow-admin").header("X-Actor-Role", "admin");
    }
    private String location() { return TestLocations.section(this::request, Map.of("name", "Flow " + UUID.randomUUID())); }
    private String item(int quantity, String location, String mode, boolean consumable) {
        var input = new HashMap<String, Object>(Map.of("name", "Flow " + UUID.randomUUID(), "category", "Test",
                "amount", quantity, "trackingMode", mode, "inventoryRole", consumable ? "consumable" : "returnable"));
        if (location != null) input.put("storageLocation", location);
        return request().body(input).post("/api/items").then().statusCode(200).extract().path("id");
    }
    private String movement(String item, String type, int quantity, String location, String lot) {
        var body = new HashMap<String, Object>(Map.of("itemId", item, "transactionType", type, "quantityChanged", quantity));
        if (location != null) body.put("locationId", location);
        if (lot != null) body.put("lotId", lot);
        return request().body(body).post("/api/transactions").then().statusCode(200).extract().path("id");
    }
    private String lot(String item, String dateField, long date) {
        return request().body(Map.of("itemId", item, "lotNumber", UUID.randomUUID().toString(), dateField, date))
                .post("/api/inventory-lots").then().statusCode(201).extract().path("id");
    }
    private String order(String item, int quantity) {
        String id = request().body(Map.of("name", "Workshop", "purpose", "Inventory regression", "requestedQuantities", Map.of(item, quantity)))
                .post("/api/orders/general").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/general/" + id + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(item, quantity))).post("/api/orders/general/" + id + "/prepare").then().statusCode(200);
        request().body(Map.of()).post("/api/orders/general/" + id + "/transitions/ready").then().statusCode(200);
        request().body(Map.of()).post("/api/orders/general/" + id + "/transitions/picked_up").then().statusCode(200);
        return id;
    }

    @Test void eventlessOrderPicksAcrossLocationsAndReturnsToReturnPlace() {
        String a = location(), b = location(), returns = location(), item = item(6, a, "bulk", false);
        movement(item, "added", 4, b, null);
        String name = request().get("/api/items/" + item).then().extract().path("name");
        request().body(Map.of("name", name, "category", "Test", "storageLocation", a, "returnLocation", returns))
                .patch("/api/items/" + item).then().statusCode(200);
        String order = order(item, 10);
        request().get("/api/items/" + item).then().body("stock.onHand", equalTo(0)).body("stock.checkedOut", equalTo(10));
        request().body(Map.of("lines", Map.of(item, Map.of("returned", 10))))
                .post("/api/orders/general/" + order + "/return").then().statusCode(200).body("status", equalTo("returned"));
        request().queryParam("itemId", item).queryParam("locationId", returns).get("/api/inventory-positions").then()
                .statusCode(200).body("[0].quantityOnHand", equalTo(10));
    }

    @Test void fefoCheckoutAndPartialRestockPreserveBothLots() {
        String place = location(), item = item(0, place, "lot_tracked", true);
        String early = lot(item, "bestBeforeDate", 1893456000000L), late = lot(item, "expiryDate", 1956528000000L);
        movement(item, "added", 3, place, late); movement(item, "added", 2, place, early);
        String checkout = movement(item, "checkout", 4, place, null);
        request().queryParam("itemId", item).get("/api/inventory-positions").then()
                .body("find { it.lotId == '" + early + "' }.quantityOnHand", equalTo(0));
        var restock = Map.of("quantity", 3, "idempotencyKey", UUID.randomUUID());
        request().body(restock).post("/api/transactions/" + checkout + "/restock").then().statusCode(200);
        request().body(restock).post("/api/transactions/" + checkout + "/restock").then().statusCode(200);
        request().queryParam("itemId", item).get("/api/inventory-positions").then()
                .body("findAll { it.lotId == null }.size()", equalTo(0)).body("quantityOnHand.sum()", equalTo(4));
        request().body(Map.of("quantity", 2)).post("/api/transactions/" + checkout + "/restock").then().statusCode(400);
    }

    @Test void lotOrderReturnAndConsumableRestockNeverCreateLotlessStock() {
        for (boolean consumable : List.of(false, true)) {
            String place = location(), item = item(0, place, "lot_tracked", consumable);
            String first = lot(item, "expiryDate", 1893456000000L), second = lot(item, "expiryDate", 1956528000000L);
            movement(item, "added", 2, place, first); movement(item, "added", 3, place, second);
            String order = order(item, 5);
            if (consumable) request().body(Map.of("quantities", Map.of(item, 4))).post("/api/orders/general/" + order + "/restock").then().statusCode(200);
            else request().body(Map.of("lines", Map.of(item, Map.of("returned", 4)))).post("/api/orders/general/" + order + "/return").then().statusCode(200);
            request().queryParam("itemId", item).get("/api/inventory-positions").then().statusCode(200)
                    .body("findAll { it.lotId == null }.size()", equalTo(0)).body("quantityOnHand.sum()", equalTo(4));
        }
    }

    @Test void transferLossDoesNotSettleAnotherPersonsCustody() {
        String source = location(), item = item(15, source, "bulk", false);
        movement(item, "checkout", 5, source, null);
        var transfer = request().body(Map.of("sourceLocationId", source, "destinationLocationId", location(), "idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("itemId", item, "quantity", 2)))).post("/api/transfers").then().statusCode(201).extract().jsonPath();
        String path = "/api/transfers/" + transfer.getString("id");
        request().body(Map.of("idempotencyKey", UUID.randomUUID())).post(path + "/dispatch").then().statusCode(200);
        request().body(Map.of("idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("transferLineId", transfer.getString("lines[0].id"),
                "receivedQuantity", 1, "discrepancyQuantity", 1)))).post(path + "/receive").then().statusCode(200);
        request().get("/api/items/" + item).then().statusCode(200).body("stock.onHand", equalTo(9))
                .body("stock.checkedOut", equalTo(5)).body("stock.totalOwned", equalTo(14));
        request().queryParam("ids", item).get("/api/items").then().statusCode(200)
                .body("find { it.id == '" + item + "' }.stock.checkedOut", equalTo(5));
        movement(item, "checkin", 5, source, null);
    }

    @Test void firstHomePutsUnlocatedBulkAwayWithoutAddingOwnedStock() {
        String item = item(10, null, "bulk", false), place = location();
        String name = request().get("/api/items/" + item).then().extract().path("name");
        request().body(Map.of("name", name, "category", "Test", "storageLocation", place)).patch("/api/items/" + item).then()
                .statusCode(200).body("stock.onHand", equalTo(10));
        movement(item, "checkout", 10, place, null);
        request().get("/api/items/" + item).then().body("stock.totalOwned", equalTo(10));
    }

    @Test void putawayRetainsUnlocatedDamageUntilItIsRepaired() {
        String item = item(4, null, "bulk", false), place = location();
        String damage = request().body(Map.of("itemId", item, "amount", 3, "severity", "medium", "description", "Broken"))
                .post("/api/damage-reports").then().statusCode(200).extract().path("id");
        request().body(Map.of("itemId", item, "amount", 2, "severity", "medium", "description", "Duplicate damaged stock"))
                .post("/api/damage-reports").then().statusCode(409);
        String name = request().get("/api/items/" + item).then().extract().path("name");
        request().body(Map.of("name", name, "category", "Test", "storageLocation", place)).patch("/api/items/" + item).then().statusCode(200);
        request().queryParam("itemId", item).get("/api/inventory-positions").then()
                .body("[0].quantityOnHand", equalTo(4)).body("[0].quantityDamaged", equalTo(3)).body("[0].availableQuantity", equalTo(1));
        request().body(Map.of("status", "repaired", "amount", 3, "notes", "Repaired all"))
                .patch("/api/damage-reports/" + damage).then().statusCode(200);
        movement(item, "checkout", 4, place, null);
    }

    @Test void stockHistoryFixesInventoryRoleAndInactivePlacesRejectNewStock() {
        String place = location(), item = item(3, place, "bulk", false);
        String name = request().get("/api/items/" + item).then().extract().path("name");
        request().body(Map.of("name", name, "category", "Test", "inventoryRole", "consumable", "storageLocation", place))
                .patch("/api/items/" + item).then().statusCode(400);
        request().delete("/api/storage-locations/" + place).then().statusCode(204);
        request().body(Map.of("itemId", item, "transactionType", "added", "quantityChanged", 1, "locationId", place))
                .post("/api/transactions").then().statusCode(409);
        request().body(Map.of("sourceLocationId", place, "destinationLocationId", location(), "idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("itemId", item, "quantity", 1)))).post("/api/transfers").then().statusCode(201);
    }

    @Test void acceptedLotSubmissionRestoresOnlyTheIssuedLot() {
        String place = location(), item = item(0, place, "lot_tracked", false);
        String issued = lot(item, "expiryDate", 1893456000000L), other = lot(item, "expiryDate", 1956528000000L);
        movement(item, "added", 2, place, issued);
        movement(item, "checkout", 2, place, issued);
        request().body(Map.of("itemId", item, "transactionType", "checkin", "quantityChanged", 1, "lotId", other))
                .post("/api/transactions").then().statusCode(409);
        String returned = request().body(Map.of("itemId", item, "quantity", 2)).post("/api/returns").then().statusCode(200).extract().path("id");
        String name = request().get("/api/items/" + item).then().extract().path("name");
        request().body(Map.of("name", name, "category", "Test", "storageLocation", place, "returnLocation", location()))
                .patch("/api/items/" + item).then().statusCode(409);
        request().body(Map.of()).post("/api/returns/" + returned + "/acknowledge").then().statusCode(200);
        request().queryParam("itemId", item).get("/api/inventory-positions").then().statusCode(200)
                .body("size()", equalTo(1)).body("[0].lotId", equalTo(issued)).body("[0].quantityOnHand", equalTo(2));
    }

    @Test void transitAndPendingReturnAssetsCannotBeWrittenOff() {
        String source = location(), item = item(1, source, "serialized", false);
        String asset = request().get("/api/items/" + item + "/assets").then().extract().path("[0].id");
        var transfer = request().body(Map.of("sourceLocationId", source, "destinationLocationId", location(), "idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("itemId", item, "assetInstanceId", asset, "quantity", 1)))).post("/api/transfers").then().statusCode(201).extract().jsonPath();
        String path = "/api/transfers/" + transfer.getString("id");
        request().body(Map.of("idempotencyKey", UUID.randomUUID())).post(path + "/dispatch").then().statusCode(200);
        request().delete("/api/items/" + item + "/assets/" + asset).then().statusCode(409);
        request().body(Map.of("idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("transferLineId", transfer.getString("lines[0].id"),
                "receivedQuantity", 1, "discrepancyQuantity", 0)))).post(path + "/receive").then().statusCode(200);
        request().body(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 1, "assetInstanceId", asset))
                .post("/api/transactions").then().statusCode(200);
        String returned = request().body(Map.of("itemId", item, "quantity", 1, "assetInstanceId", asset)).post("/api/returns").then().statusCode(200).extract().path("id");
        request().delete("/api/items/" + item + "/assets/" + asset).then().statusCode(409);
        request().body(Map.of()).post("/api/returns/" + returned + "/acknowledge").then().statusCode(200);
    }

    @Test void damageStaysAtTheSelectedPositionThroughRepair() {
        String a = location(), b = location(), item = item(3, a, "bulk", false);
        movement(item, "added", 2, b, null);
        String position = request().queryParam("itemId", item).queryParam("locationId", b).get("/api/inventory-positions").then().extract().path("[0].id");
        request().body(Map.of("itemId", item, "amount", 2, "severity", "medium", "description", "Broken"))
                .post("/api/damage-reports").then().statusCode(400);
        String damage = request().body(Map.of("itemId", item, "positionId", position, "amount", 2, "severity", "medium", "description", "Broken"))
                .post("/api/damage-reports").then().statusCode(200).extract().path("id");
        request().queryParam("itemId", item).get("/api/inventory-positions").then()
                .body("find { it.locationId == '" + a + "' }.quantityDamaged", equalTo(0))
                .body("find { it.locationId == '" + b + "' }.quantityDamaged", equalTo(2));
        request().body(Map.of("status", "repaired", "amount", 1, "notes", "Repaired one"))
                .patch("/api/damage-reports/" + damage).then().statusCode(200);
        request().queryParam("itemId", item).queryParam("locationId", b).get("/api/inventory-positions").then()
                .body("[0].quantityOnHand", equalTo(2)).body("[0].quantityDamaged", equalTo(1));
    }

    @Test void mixedAssemblyBatchIssuesExactAssetsAndSourcesAtomically() {
        String a = location(), b = location(), bulk = item(2, a, "bulk", false), serialized = item(1, b, "serialized", false);
        movement(bulk, "added", 2, b, null);
        String asset = request().get("/api/items/" + serialized + "/assets").then().extract().path("[0].id");
        List<Map<String, Object>> commands = List.of(
                Map.of("itemId", bulk, "transactionType", "checkout", "quantityChanged", 2, "locationId", a, "idempotencyKey", UUID.randomUUID()),
                Map.of("itemId", bulk, "transactionType", "checkout", "quantityChanged", 1, "locationId", b, "idempotencyKey", UUID.randomUUID()),
                Map.of("itemId", serialized, "transactionType", "checkout", "quantityChanged", 1, "assetInstanceId", asset, "idempotencyKey", UUID.randomUUID()));
        request().body(commands).post("/api/transactions/batch").then().statusCode(200).body("size()", equalTo(3));
        request().body(commands).post("/api/transactions/batch").then().statusCode(200);
        request().get("/api/items/" + bulk).then().body("stock.checkedOut", equalTo(3));
        request().get("/api/items/" + serialized + "/assets").then().body("[0].availabilityStatus", equalTo("in_field"));
    }

    @Test void percentagePurchaseValueUsesTheFullUnitPrice() {
        var item = new org.ash.inventory.operations.internal.model.Item(); item.quantityDecimals = 2;
        var line = new org.ash.inventory.operations.internal.model.PurchaseOrderLine(); line.item = item; line.unitPriceCents = 1999;
        line.orderedQuantity = 100; org.junit.jupiter.api.Assertions.assertEquals(1999, line.orderedValueCents());
        line.orderedQuantity = 25; org.junit.jupiter.api.Assertions.assertEquals(500, line.orderedValueCents());
    }

    @Test void publicUseDoesNotGrantReturnReviewAuthority() {
        String place = location();
        String item = request().body(Map.of("name", "Offered " + UUID.randomUUID(), "category", "Test", "amount", 1,
                "privateResource", true, "publicUse", true, "storageLocation", place)).post("/api/items").then().statusCode(200).extract().path("id");
        movement(item, "checkout", 1, place, null);
        String returned = request().body(Map.of("itemId", item, "quantity", 1)).post("/api/returns").then().statusCode(200).extract().path("id");
        given().contentType(ContentType.JSON).header("X-Actor-Id", "flow-reader").header("X-Actor-Role", "read_only")
                .body(Map.of()).post("/api/returns/" + returned + "/acknowledge").then().statusCode(403);
        request().get("/api/items/" + item).then().body("stock.checkedOut", equalTo(1));
        request().body(Map.of()).post("/api/returns/" + returned + "/acknowledge").then().statusCode(200);
    }

    @Test void privateTenantCanTransferCountIssueAndAcceptOwnReturns() {
        var tenant = given().contentType(ContentType.JSON).header("X-Actor-Id", "flow-tenant").header("X-Actor-Role", "tenant");
        java.util.function.Supplier<RequestSpecification> who = () -> given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "flow-tenant").header("X-Actor-Role", "tenant");
        String a = TestLocations.section(who, Map.of("name", "Tenant A " + UUID.randomUUID()));
        String b = TestLocations.section(who, Map.of("name", "Tenant B " + UUID.randomUUID()));
        String item = tenant.body(Map.of("name", "Private stock " + UUID.randomUUID(), "category", "Test", "amount", 3, "storageLocation", a))
                .post("/api/items").then().statusCode(200).extract().path("id");
        var transfer = who.get().body(Map.of("sourceLocationId", a, "destinationLocationId", b, "idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("itemId", item, "quantity", 2)))).post("/api/transfers").then().statusCode(201).extract().jsonPath();
        String transferPath = "/api/transfers/" + transfer.getString("id");
        who.get().body(Map.of("idempotencyKey", UUID.randomUUID())).post(transferPath + "/dispatch").then().statusCode(200);
        who.get().body(Map.of("idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("transferLineId", transfer.getString("lines[0].id"),
                "receivedQuantity", 2, "discrepancyQuantity", 0)))).post(transferPath + "/receive").then().statusCode(200);
        who.get().get("/api/transfers").then().statusCode(200).body("id", hasItem(transfer.getString("id")));
        var count = who.get().body(Map.of("itemId", item, "locationId", b)).post("/api/inventory-counts").then().statusCode(201).extract().jsonPath();
        String countPath = "/api/inventory-counts/" + count.getString("id");
        who.get().body(Map.of("lines", List.of(Map.of("lineId", count.getString("lines[0].id"), "quantity", 2))))
                .post(countPath + "/submit").then().statusCode(200);
        who.get().body(Map.of()).post(countPath + "/approve").then().statusCode(200);
        who.get().body(Map.of()).post(countPath + "/post").then().statusCode(200);
        who.get().body(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 2, "locationId", b))
                .post("/api/transactions").then().statusCode(200);
        String returned = who.get().body(Map.of("itemId", item, "quantity", 2)).post("/api/returns").then().statusCode(200).extract().path("id");
        who.get().body(Map.of()).post("/api/returns/" + returned + "/acknowledge").then().statusCode(200);
        who.get().get("/api/items/" + item).then().statusCode(200).body("stock.checkedOut", equalTo(0)).body("stock.onHand", equalTo(3));
        String publicItem = item(2, location(), "bulk", false);
        who.get().body(List.of(Map.of("itemId", item, "transactionType", "checkout", "quantityChanged", 1),
                Map.of("itemId", publicItem, "transactionType", "checkout", "quantityChanged", 1)))
                .post("/api/transactions/batch").then().statusCode(404);
        who.get().get("/api/items/" + item).then().body("stock.onHand", equalTo(3));
    }
}
