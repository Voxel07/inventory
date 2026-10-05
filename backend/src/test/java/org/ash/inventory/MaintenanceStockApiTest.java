package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.*;
import org.ash.inventory.service.InventoryOperationsService;
import org.ash.inventory.service.PlanningStockService;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
class MaintenanceStockApiTest {
    @Inject EntityManager em;
    @Inject PlanningStockService planning;
    @Inject InventoryOperationsService inventory;
    private RequestSpecification admin() { return given().contentType(ContentType.JSON).header("X-Actor-Id", "maintenance-stock-admin").header("X-Actor-Role", "hq_admin"); }
    private String location() { return admin().body(Map.of("name", "Stock " + UUID.randomUUID())).post("/api/storage-locations").then().statusCode(200).extract().path("id"); }
    private String item(String location, boolean serialized, int amount) {
        return admin().body(Map.of("sku", "STOCK-" + UUID.randomUUID(), "name", "Stock policy test", "category", "Stock policy",
                "amount", amount, "minStock", 0, "trackingMode", serialized ? "serialized" : "bulk", "storageLocation", location))
                .post("/api/items").then().statusCode(200).extract().path("id");
    }
    private List<String> assets(String item) { return admin().get("/api/items/" + item + "/assets").then().statusCode(200).extract().path("id"); }
    private String schedule(String item, String asset, String type, int due) {
        var input = new HashMap<String, Object>(Map.of("itemId", item, "maintenanceType", "generator_service", "intervalType", type,
                "intervalValue", 10, "nextDueValue", due, "warningWindow", 1, "checkoutBlocking", true));
        if (asset != null) input.put("assetInstanceId", asset);
        return admin().body(input).post("/api/maintenance-schedules").then().statusCode(201).extract().path("id");
    }
    private void transact(String item, String asset, String type, int status) {
        admin().body(Map.of("itemId", item, "assetInstanceId", asset, "transactionType", type, "quantityChanged", 1, "eventType", "DE", "faction", "Stock policy"))
                .post("/api/transactions").then().statusCode(status);
    }
    private void parity(String item, int available) {
        QuarkusTransaction.requiringNew().run(() -> {
            var value = em.find(Item.class, UUID.fromString(item));
            assertEquals(available, inventory.stock(value).available());
            assertEquals(available, planning.load(List.of(value)).get(value.id).stock().available());
        });
    }
    private void stock(String item, int onHand, int transit, int owned) {
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.onHand", equalTo(onHand))
                .body("stock.inTransit", equalTo(transit)).body("stock.totalOwned", equalTo(owned)).body("stock.available", equalTo(onHand));
        QuarkusTransaction.requiringNew().run(() -> {
            var value = em.find(Item.class, UUID.fromString(item));
            var snapshot = planning.load(List.of(value)).get(value.id).stock();
            assertEquals(onHand, snapshot.onHand()); assertEquals(transit, snapshot.inTransit()); assertEquals(owned, snapshot.totalOwned());
        });
        admin().post("/api/reports/availability/rebuild").then().statusCode(204);
        var rows = admin().queryParam("itemId", item).get("/api/reports/availability").then().statusCode(200).extract().jsonPath();
        assertEquals(onHand, rows.getInt("rows.sum { it.onHand ?: 0 }"));
        assertEquals(transit, rows.getInt("rows.sum { it.inTransit ?: 0 }"));
    }

    @Test void itemAndAssetHourScopesAgreeInPlanningAndCheckout() {
        String item = item(location(), true, 2); var assets = assets(item);
        admin().body(Map.of("ownershipType", "private_owner", "ownerName", "Equipment owner", "availabilityPolicy", "commitment_required",
                "revision", 0, "reason", "Owner consent"))
                .put("/api/items/" + item + "/equipment").then().statusCode(200);
        admin().body(Map.of("quantity", 2, "assetIds", assets, "availableFrom", java.time.LocalDate.now().toString(),
                "availableUntil", java.time.LocalDate.now().plusDays(1).toString(), "pickupDetails", "Warehouse", "notes", "Owner consent", "revision", 1,
                "returnDue", java.time.LocalDate.now().plusDays(1).toString(), "returnDetails", "Return to owner"))
                .post("/api/items/" + item + "/equipment/commitments").then().statusCode(200);
        QuarkusTransaction.requiringNew().run(() -> {
            em.find(Item.class, UUID.fromString(item)).currentOperatingHours = new BigDecimal("12");
            em.find(AssetInstance.class, UUID.fromString(assets.get(0))).operatingHours = BigDecimal.ONE;
            em.find(AssetInstance.class, UUID.fromString(assets.get(1))).operatingHours = new BigDecimal("20");
        });
        String itemSchedule = schedule(item, null, "operating_hours", 10);
        parity(item, 0); transact(item, assets.get(0), "checkout", 409);
        QuarkusTransaction.requiringNew().run(() -> em.find(MaintenanceSchedule.class, UUID.fromString(itemSchedule)).active = false);
        schedule(item, assets.get(1), "operating_hours", 10);
        parity(item, 1); transact(item, assets.get(0), "checkout", 200);
    }

    @Test void itemUsageIncludesEveryAssetWhileAssetUsageStaysScoped() {
        String item = item(location(), true, 2); var assets = assets(item);
        for (int pass = 0; pass < 2; pass++) { transact(item, assets.get(0), "checkout", 200); transact(item, assets.get(0), "checkin", 200); }
        String itemSchedule = schedule(item, null, "usage_count", 2);
        parity(item, 0); transact(item, assets.get(1), "checkout", 409);
        QuarkusTransaction.requiringNew().run(() -> em.find(MaintenanceSchedule.class, UUID.fromString(itemSchedule)).active = false);
        schedule(item, assets.get(0), "usage_count", 2);
        parity(item, 1); transact(item, assets.get(1), "checkout", 200);
    }

    @Test void unknownSchedulesBlockPlanningAndAppearInReportsAndInbox() {
        String item = item(location(), true, 1), asset = assets(item).getFirst();
        String schedule = schedule(item, asset, "operating_hours", 10);
        QuarkusTransaction.requiringNew().run(() -> em.find(MaintenanceSchedule.class, UUID.fromString(schedule)).nextDueValue = null);
        parity(item, 0); transact(item, asset, "checkout", 409);
        admin().get("/api/action-inbox").then().statusCode(200).body("key", hasItem("maintenance:" + schedule));
        admin().post("/api/reports/maintenance/rebuild").then().statusCode(204);
        admin().queryParam("itemId", item).get("/api/reports/maintenance").then().statusCode(200)
                .body("rows.find { it.id == '" + schedule + "' }.status", equalTo("unknown"));
    }

    @Test void serializedTransfersRetainOwnershipThroughPartialReceiptAndDiscrepancy() {
        String source = location(), destination = location(), item = item(source, true, 2);
        var assets = assets(item);
        var transfer = admin().body(Map.of("sourceLocationId", source, "destinationLocationId", destination, "idempotencyKey", UUID.randomUUID(),
                "lines", assets.stream().map(a -> Map.of("itemId", item, "assetInstanceId", a, "quantity", 1)).toList()))
                .post("/api/transfers").then().statusCode(201).extract().jsonPath();
        String id = transfer.getString("id"); List<String> lines = transfer.getList("lines.id");
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/transfers/" + id + "/dispatch").then().statusCode(200);
        stock(item, 0, 2, 2);
        receive(id, lines.get(0), 1, 0); stock(item, 1, 1, 2);
        receive(id, lines.get(1), 0, 1); stock(item, 1, 0, 1);
        admin().get("/api/items/" + item + "/assets").then().statusCode(200)
                .body("find { it.availabilityStatus == 'available' }.currentLocationId", equalTo(destination));
    }

    @Test void bulkTransfersUseTheSameTransitAndOwnedTotals() {
        String source = location(), item = item(source, false, 3);
        var transfer = admin().body(Map.of("sourceLocationId", source, "destinationLocationId", location(), "idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("itemId", item, "quantity", 2))))
                .post("/api/transfers").then().statusCode(201).extract().jsonPath();
        String id = transfer.getString("id"), line = transfer.getString("lines[0].id");
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/transfers/" + id + "/dispatch").then().statusCode(200);
        stock(item, 1, 2, 3);
        receive(id, line, 1, 0); stock(item, 2, 1, 3);
        receive(id, line, 0, 1); stock(item, 2, 0, 2);
    }

    @Test void providerLoanTransfersPreserveExactAssetsAndExternalOwnership() {
        String provider = location(), internal = location(), item = item(provider, true, 1);
        var assets = assets(item);
        admin().body(Map.of("ownershipType", "external", "ownerName", "Provider", "availabilityPolicy", "commitment_required",
                "revision", 0, "reason", "Provider consent"))
                .put("/api/items/" + item + "/equipment").then().statusCode(200);
        String commitment = admin().body(Map.of("quantity", 1, "assetIds", assets, "availableFrom", java.time.LocalDate.now().toString(),
                "availableUntil", java.time.LocalDate.now().plusDays(1).toString(), "pickupDetails", "Provider depot", "notes", "Loan consent", "revision", 1,
                "returnDue", java.time.LocalDate.now().plusDays(1).toString(), "returnDetails", "Return to provider"))
                .post("/api/items/" + item + "/equipment/commitments").then().statusCode(200).extract().path("commitments[0].id");
        var loan = admin().body(Map.of("commitmentId", commitment, "providerLocationId", provider, "kind", "borrow",
                "provider", "Provider", "contact", "Warehouse", "terms", "Return the exact asset"))
                .post("/api/loans").then().statusCode(200).extract().jsonPath();
        long revision = loan.getLong("revision"); String loanId = loan.getString("id");
        for (boolean returning : List.of(false, true)) {
            var transfer = admin().body(Map.of("sourceLocationId", returning ? internal : provider, "destinationLocationId", returning ? provider : internal,
                    "idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("itemId", item, "assetInstanceId", assets.getFirst(), "quantity", 1))))
                    .post("/api/transfers").then().statusCode(201).extract().jsonPath();
            String id = transfer.getString("id");
            admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/transfers/" + id + "/dispatch").then().statusCode(200);
            admin().get("/api/items/" + item).then().statusCode(200).body("stock.onHand", equalTo(0))
                    .body("stock.inTransit", equalTo(1)).body("stock.totalOwned", equalTo(0));
            parity(item, 0);
            receive(id, transfer.getString("lines[0].id"), 1, 0);
            revision = admin().body(Map.of("transferId", id, "revision", revision, "notes", "Exact asset received"))
                    .post("/api/loans/" + loanId + (returning ? "/return" : "/collect")).then().statusCode(200).extract().jsonPath().getLong("revision");
            parity(item, returning ? 0 : 1);
            admin().get("/api/items/" + item + "/assets").then().statusCode(200).body("[0].id", equalTo(assets.getFirst()))
                    .body("[0].currentLocationId", equalTo(returning ? provider : internal));
        }
    }

    private void receive(String transfer, String line, int received, int discrepancy) {
        admin().body(Map.of("idempotencyKey", UUID.randomUUID(), "lines", List.of(Map.of("transferLineId", line,
                "receivedQuantity", received, "discrepancyQuantity", discrepancy, "discrepancyNotes", "Arrival check"))))
                .post("/api/transfers/" + transfer + "/receive").then().statusCode(200);
    }

    @Test void availabilityReportHonoursTheContributorDamageHold() {
        String item = item(location(), false, 3);
        String requester = admin().get("/api/auth/me").then().statusCode(200).extract().path("id");
        QuarkusTransaction.requiringNew().run(() -> {
            var request = new MemberRequest();
            request.requester = em.find(UserAccount.class, UUID.fromString(requester));
            request.item = em.find(Item.class, UUID.fromString(item));
            request.kind = "damage";
            request.quantity = 1;
            request.notes = "Contributor reported damage";
            request.commandId = UUID.randomUUID();
            em.persist(request);
        });
        admin().get("/api/items/" + item).then().statusCode(200).body("stock.onHand", equalTo(3)).body("stock.available", equalTo(0));
        admin().post("/api/reports/availability/rebuild").then().statusCode(204);
        var rows = admin().queryParam("itemId", item).get("/api/reports/availability").then().statusCode(200).extract().jsonPath();
        assertEquals(3, rows.getInt("rows.sum { it.onHand ?: 0 }"));
        assertEquals(0, rows.getInt("rows.sum { it.available ?: 0 }"));
    }
}
