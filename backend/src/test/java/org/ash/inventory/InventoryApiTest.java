package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.ash.inventory.model.DomainEvent;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.service.DomainEventService;

import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

@QuarkusTest
class InventoryApiTest {
    @Inject EntityManager entityManager;
    @Inject DomainEventService domainEvents;

    @Test
    void categoryMaintenanceIntervalAppliesToExistingAndNewItems() {
        String category = "Maintenance policy test";
        String firstId = request().body(Map.of("sku", "MAINT-POLICY-001", "name", "Policy first item",
                        "category", category, "amount", 1, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        request().body(Map.of("category", category, "intervalDays", 180))
                .put("/api/category-maintenance").then().statusCode(200)
                .body("intervalDays", equalTo(180)).body("category", equalTo(category));
        request().get("/api/items/" + firstId).then().statusCode(200)
                .body("maintenanceIntervalDays", equalTo(180))
                .body("nextMaintenanceDue", notNullValue());

        String secondId = request().body(Map.of("sku", "MAINT-POLICY-002", "name", "Policy second item",
                        "category", category, "amount", 1, "value", 0))
                .post("/api/items").then().statusCode(200)
                .body("maintenanceIntervalDays", equalTo(180))
                .extract().path("id");
        request().body(Map.of("itemId", secondId, "type", "dguv_v3", "result", "passed"))
                .post("/api/maintenance").then().statusCode(200).body("nextDueAt", notNullValue());
        request().body(Map.of("category", category, "intervalDays", 0))
                .put("/api/category-maintenance").then().statusCode(200);
        request().get("/api/items/" + firstId).then().statusCode(200)
                .body("maintenanceIntervalDays", nullValue()).body("nextMaintenanceDue", nullValue());
        request().get("/api/items/" + secondId).then().statusCode(200)
                .body("maintenanceIntervalDays", nullValue());
    }

    @Test
    void eventUsageComesFromOrdersAndReturns() {
        String usedItemId = request().body(Map.of("sku", "EVENT-USED-001", "name", "Used event item",
                        "category", "Test", "amount", 10, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String plannedOnlyItemId = request().body(Map.of("sku", "EVENT-PLAN-001", "name", "Planned-only event item",
                        "category", "Test", "amount", 10, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");

        var event = new java.util.HashMap<String, Object>();
        event.put("eventType", "LS");
        event.put("name", "LightSim history test");
        event.put("startDate", "2026-06-13");
        event.put("endDate", "2026-06-13");
        event.put("status", "completed");
        event.put("plannedQuantities", Map.of(usedItemId, 8, plannedOnlyItemId, 3));
        event.put("usedQuantities", Map.of(usedItemId, 6, plannedOnlyItemId, 0));

        String eventId = request().body(event).post("/api/events").then().statusCode(200)
                .body("plannedQuantities.'" + usedItemId + "'", equalTo(8))
                .body("plannedQuantities.'" + plannedOnlyItemId + "'", equalTo(3))
                .body("usedQuantities.size()", equalTo(0))
                .body("itemIds.size()", equalTo(0))
                .body("itemNames.'" + usedItemId + "'", equalTo("Used event item"))
                .extract().path("id");

        String orderId = request().body(Map.of("name", "Event catering", "purpose", "Test use",
                        "eventOccurrenceId", eventId, "requestedQuantities", Map.of(usedItemId, 6)))
                .post("/api/general-orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/general-orders/" + orderId + "/submit").then().statusCode(200);
        request().body(Map.of()).post("/api/general-orders/" + orderId + "/ready").then().statusCode(200);
        request().body(Map.of()).post("/api/general-orders/" + orderId + "/pickup").then().statusCode(200);

        request().get("/api/events/" + eventId).then().statusCode(200)
                .body("usedQuantities.'" + usedItemId + "'", equalTo(6))
                .body("itemIds[0]", equalTo(usedItemId));
        request().body(Map.of("returnedQuantities", Map.of(usedItemId, 2), "consumedQuantities", Map.of()))
                .post("/api/general-orders/" + orderId + "/return").then().statusCode(200)
                .body("status", equalTo("partially_returned"));
        request().get("/api/events/" + eventId).then().statusCode(200)
                .body("usedQuantities.'" + usedItemId + "'", equalTo(4));
    }

    @Test
    void serializedAssetsCanBeSelectedForDirectCheckoutAndOrderPacking() {
        String itemId = request().body(Map.of("sku", "SERIAL-FLOW-001", "name", "Serialized generator",
                        "category", "Test", "amount", 2, "value", 0, "trackingMode", "serialized"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        var assets = request().get("/api/items/" + itemId + "/assets").then().statusCode(200).extract().jsonPath();
        String firstAssetId = assets.getString("[0].id");
        String secondAssetId = assets.getString("[1].id");

        // Quantity-only commands remain guarded, but selecting an exact physical unit succeeds.
        request().body(Map.of("itemId", itemId, "transactionType", "checkout", "quantityChanged", 1,
                        "eventType", "DE", "faction", "KGG"))
                .post("/api/transactions").then().statusCode(409);
        request().body(Map.of("itemId", itemId, "assetInstanceId", firstAssetId,
                        "transactionType", "checkout", "quantityChanged", 1,
                        "eventType", "DE", "faction", "KGG", "reason", "Field use"))
                .post("/api/transactions").then().statusCode(200)
                .body("assetInstanceId", equalTo(firstAssetId))
                .body("expand.assetInstanceId.assetCode", equalTo("SERIAL-FLOW-001-001"));
        request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .body("[0].availabilityStatus", equalTo("in_field"));
        request().body(Map.of("itemId", itemId, "assetInstanceId", firstAssetId,
                        "transactionType", "checkin", "quantityChanged", 1, "reason", "Returned"))
                .post("/api/transactions").then().statusCode(200)
                .body("assetInstanceId", equalTo(firstAssetId));

        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Serialized packing faction");
        orderBody.put("eventDate", "2037-09-10");
        orderBody.put("requestedQuantities", Map.of(itemId, 1));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String orderId = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 1), "acknowledgeShortages", false))
                .post("/api/orders/" + orderId + "/prepare").then().statusCode(400);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 1),
                        "assetAssignments", Map.of(itemId, java.util.List.of(secondAssetId)),
                        "acknowledgeShortages", false))
                .post("/api/orders/" + orderId + "/prepare").then().statusCode(200)
                .body("assetAssignments.'" + itemId + "'[0].id", equalTo(secondAssetId))
                .body("assetAssignments.'" + itemId + "'[0].availabilityStatus", equalTo("staged"));
        request().body(Map.of("pickupLatitude", 52.5, "pickupLongitude", 13.4))
                .post("/api/orders/" + orderId + "/transitions/ready").then().statusCode(200);
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/picked_up").then().statusCode(200)
                .body("assetAssignments.'" + itemId + "'[0].id", equalTo(secondAssetId))
                .body("assetAssignments.'" + itemId + "'[0].availabilityStatus", equalTo("in_field"));
        request().queryParam("itemId", itemId).get("/api/transactions").then().statusCode(200)
                .body("find { it.assetInstanceId == '" + secondAssetId + "' }.factionOrderId", equalTo(orderId));
        request().body(Map.of()).post("/api/orders/" + orderId + "/return-all").then().statusCode(200)
                .body("status", equalTo("returned"))
                .body("assetAssignments.'" + itemId + "'[0].availabilityStatus", equalTo("available"));
        request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .body("[1].availabilityStatus", equalTo("available"));
    }

    @Test
    void damageReportsSupportSerializedAssetsAssembliesAndMetadataEditing() {
        String itemId = request().body(Map.of("sku", "DAMAGE-TARGET-001", "name", "Damage target generator",
                        "category", "Test", "amount", 1, "value", 0, "trackingMode", "serialized"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String assetId = request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .extract().path("[0].id");

        request().body(Map.of("itemId", itemId, "amount", 1, "description", "Missing concrete asset", "severity", "high"))
                .post("/api/damage-reports").then().statusCode(400);
        request().body(Map.of("itemId", itemId, "assetInstanceId", assetId, "amount", 1,
                        "description", "Starter housing cracked", "severity", "high"))
                .post("/api/damage-reports").then().statusCode(200)
                .body("itemId", equalTo(itemId))
                .body("assetInstanceId", equalTo(assetId))
                .body("assetCode", equalTo("DAMAGE-TARGET-001-001"));
        request().queryParam("assetInstanceId", assetId).get("/api/damage-reports").then().statusCode(200)
                .body("size()", equalTo(1)).body("[0].assetInstanceId", equalTo(assetId));

        String assemblyId = request().body(Map.of("name", "Damage target assembly", "itemQuantities", Map.of(itemId, 1)))
                .post("/api/assemblies").then().statusCode(200).extract().path("id");
        String reportId = request().body(Map.of("assemblyId", assemblyId, "amount", 1,
                        "description", "Frame bent", "severity", "medium"))
                .post("/api/damage-reports").then().statusCode(200)
                .body("itemId", nullValue())
                .body("assemblyId", equalTo(assemblyId))
                .body("assemblyName", equalTo("Damage target assembly"))
                .extract().path("id");
        request().queryParam("assemblyId", assemblyId).get("/api/damage-reports").then().statusCode(200)
                .body("size()", equalTo(1)).body("[0].id", equalTo(reportId));

        request().body(Map.of("description", "Frame and latch bent", "severity", "critical"))
                .patch("/api/damage-reports/" + reportId).then().statusCode(200)
                .body("description", equalTo("Frame and latch bent"))
                .body("severity", equalTo("critical"));
        request().body(Map.of("status", "repaired", "amount", 1))
                .patch("/api/damage-reports/" + reportId).then().statusCode(200)
                .body("status", equalTo("repaired"));
    }

    @Test
    void serializedItemCreationProvisionsAssetsAndBlocksTrackingModeChangeWithStock() {
        // 1. Create a serialized item with amount = 3
        String itemId = request().body(Map.of("sku", "GEN-HONDA-01", "name", "Honda 2kW Generator",
                        "category", "Power", "amount", 3, "minStock", 1, "value", 1200, "trackingMode", "serialized"))
                .post("/api/items").then().statusCode(200)
                .body("stock.totalOwned", org.hamcrest.Matchers.equalTo(3))
                .body("stock.available", org.hamcrest.Matchers.equalTo(3))
                .extract().path("id");

        // 2. Verify 3 asset instances were created
        request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .body("size()", org.hamcrest.Matchers.equalTo(3))
                .body("[0].assetCode", org.hamcrest.Matchers.equalTo("GEN-HONDA-01-001"))
                .body("[1].assetCode", org.hamcrest.Matchers.equalTo("GEN-HONDA-01-002"))
                .body("[2].assetCode", org.hamcrest.Matchers.equalTo("GEN-HONDA-01-003"));

        // 3. Changing tracking mode to bulk must be rejected because item has stock and assets
        request().body(Map.of("name", "Honda 2kW Generator", "category", "Power", "trackingMode", "bulk"))
                .patch("/api/items/" + itemId).then().statusCode(400);

        // Omitting trackingMode from an otherwise valid update must preserve it.
        request().body(Map.of("name", "Honda 2kW Generator updated", "category", "Power"))
                .patch("/api/items/" + itemId).then().statusCode(200)
                .body("trackingMode", equalTo("serialized"));

        // 4. Batch add 2 more assets
        request().body(Map.of("batchCount", 2, "codePrefix", "GEN-HONDA-01-"))
                .post("/api/items/" + itemId + "/assets").then().statusCode(200)
                .body("size()", org.hamcrest.Matchers.equalTo(2));

        // 5. Verify total owned stock is now 5
        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("stock.totalOwned", org.hamcrest.Matchers.equalTo(5))
                .body("stock.available", org.hamcrest.Matchers.equalTo(5));

        // 6. Create bulk item with stock, then verify attempting to switch to serialized is rejected
        String bulkId = request().body(Map.of("sku", "BULK-BB-01", "name", "BBs 0.28g",
                        "category", "Ammo", "amount", 10, "minStock", 2, "value", 15, "trackingMode", "bulk"))
                .post("/api/items").then().statusCode(200).extract().path("id");

        request().body(Map.of("name", "BBs 0.28g", "category", "Ammo", "trackingMode", "serialized"))
                .patch("/api/items/" + bulkId).then().statusCode(400);
    }

    @Test
    void overdueAssetScheduleBlocksCheckoutUntilMaintenanceIsRecorded() {
        String itemId = request().body(Map.of(
                        "sku", "SCHEDULE-BLOCK-001", "name", "Scheduled test asset", "category", "Test",
                        "amount", 1, "value", 0, "trackingMode", "serialized"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String assetId = request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .extract().path("[0].id");

        String scheduleId = request().body(Map.of(
                        "itemId", itemId,
                        "assetInstanceId", assetId,
                        "maintenanceType", "generator_service",
                        "intervalType", "date",
                        "intervalValue", 30,
                        "nextDueAt", "2020-01-01T00:00:00Z",
                        "checkoutBlocking", true))
                .post("/api/maintenance-schedules").then().statusCode(201)
                .body("assetInstanceId", equalTo(assetId)).extract().path("id");

        request().body(Map.of(
                        "itemId", itemId, "assetInstanceId", assetId,
                        "transactionType", "checkout", "quantityChanged", 1,
                        "eventType", "DE", "faction", "KGG"))
                .post("/api/transactions").then().statusCode(409)
                .body("error", org.hamcrest.Matchers.containsString("overdue generator_service"));

        request().body(Map.of(
                        "itemId", itemId,
                        "assetInstanceId", assetId,
                        "scheduleId", scheduleId,
                        "type", "generator_service",
                        "performedAt", "2030-01-01T00:00:00Z",
                        "result", "passed"))
                .post("/api/maintenance").then().statusCode(200)
                .body("nextDueAt", equalTo("2030-01-31T00:00:00Z"));

        request().body(Map.of(
                        "itemId", itemId, "assetInstanceId", assetId,
                        "transactionType", "checkout", "quantityChanged", 1,
                        "eventType", "DE", "faction", "KGG"))
                .post("/api/transactions").then().statusCode(200);
    }

    @Test
    void purchaseReceiptPostsStockDamageAndPositionIdempotently() {
        String locationId = request().body(Map.of("name", "Receipt bay 001", "mapZoom", 16))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String itemId = request().body(Map.of(
                        "sku", "RECEIPT-BULK-001", "name", "Receipt bulk item", "category", "Test",
                        "amount", 0, "value", 0, "trackingMode", "bulk"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String vendorId = request().body(Map.of("name", "Receipt Vendor 001", "preferredVendor", true))
                .post("/api/vendors").then().statusCode(201).extract().path("id");
        String purchaseOrderId = request().body(Map.of(
                        "vendorId", vendorId,
                        "orderDate", "2026-09-12",
                        "lines", java.util.List.of(Map.of(
                                "itemId", itemId, "orderedQuantity", 5, "unitPriceCents", 125))))
                .post("/api/purchase-orders").then().statusCode(201)
                .body("status", equalTo("draft"))
                .body("vendorName", equalTo("Receipt Vendor 001"))
                .body("createdByName", equalTo("Test Admin"))
                .body("orderDate", equalTo("2026-09-12"))
                .body("lines[0].unitPriceCents", equalTo(125)).extract().path("id");
        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("stock.ordered", equalTo(0)).body("stock.available", equalTo(0));
        String purchaseOrderLineId = request().get("/api/purchase-orders").then().statusCode(200)
                .extract().path("find { it.id == '" + purchaseOrderId + "' }.lines[0].id");
        request().body(Map.of("status", "ordered"))
                .post("/api/purchase-orders/" + purchaseOrderId + "/transitions")
                .then().statusCode(200).body("status", equalTo("ordered"));
        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("stock.ordered", equalTo(5)).body("stock.available", equalTo(0));
        request().queryParam("search", "RECEIPT-BULK-001").get("/api/items").then().statusCode(200)
                .body("find { it.id == '" + itemId + "' }.stock.ordered", equalTo(5));

        String idempotencyKey = java.util.UUID.randomUUID().toString();
        var receipt = Map.of(
                "purchaseOrderId", purchaseOrderId,
                "receivingLocationId", locationId,
                "idempotencyKey", idempotencyKey,
                "lines", java.util.List.of(Map.of(
                        "purchaseOrderLineId", purchaseOrderLineId,
                        "acceptedQuantity", 2,
                        "damagedQuantity", 1,
                        "rejectedQuantity", 1)));
        request().body(receipt).post("/api/goods-receipts").then().statusCode(201)
                .body("status", equalTo("partially_accepted"))
                .body("lines[0].expectedQuantity", equalTo(5));
        request().body(receipt).post("/api/goods-receipts").then().statusCode(201);

        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("stock.totalOwned", equalTo(3))
                .body("stock.damaged", equalTo(1))
                .body("stock.available", equalTo(2))
                .body("stock.ordered", equalTo(2));
        request().queryParam("itemId", itemId).queryParam("locationId", locationId)
                .get("/api/inventory-positions").then().statusCode(200)
                .body("size()", equalTo(1))
                .body("[0].quantityOnHand", equalTo(3))
                .body("[0].quantityDamaged", equalTo(1));
        request().queryParam("itemId", itemId).get("/api/damage-reports").then().statusCode(200)
                .body("size()", equalTo(1)).body("[0].amount", equalTo(1));
        request().queryParam("purchaseOrderId", purchaseOrderId).get("/api/goods-receipts")
                .then().statusCode(200).body("size()", equalTo(1));
        request().body(Map.of("status", "cancelled"))
                .post("/api/purchase-orders/" + purchaseOrderId + "/transitions")
                .then().statusCode(200).body("status", equalTo("cancelled"));
        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("stock.ordered", equalTo(0)).body("stock.available", equalTo(2));
    }

    @Test
    void serializedTransferPreservesIdentityAcrossTransit() {
        String sourceId = request().body(Map.of("name", "Transfer source 001", "mapZoom", 16))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String destinationId = request().body(Map.of("name", "Transfer destination 001", "mapZoom", 16))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String itemId = request().body(Map.of(
                        "sku", "TRANSFER-ASSET-001", "name", "Transferred asset", "category", "Test",
                        "amount", 1, "value", 0, "trackingMode", "serialized", "storageLocation", sourceId))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String assetId = request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .extract().path("[0].id");

        String transferId = request().body(Map.of(
                        "sourceLocationId", sourceId,
                        "destinationLocationId", destinationId,
                        "idempotencyKey", java.util.UUID.randomUUID().toString(),
                        "lines", java.util.List.of(Map.of(
                                "itemId", itemId, "assetInstanceId", assetId, "quantity", 1))))
                .post("/api/transfers").then().statusCode(201).extract().path("id");
        String lineId = request().get("/api/transfers").then().statusCode(200)
                .extract().path("find { it.id == '" + transferId + "' }.lines[0].id");
        request().body(Map.of("idempotencyKey", java.util.UUID.randomUUID().toString()))
                .post("/api/transfers/" + transferId + "/dispatch").then().statusCode(200)
                .body("status", equalTo("in_transit"));
        request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .body("[0].availabilityStatus", equalTo("in_transit"))
                .body("[0].currentLocationId", nullValue());

        String receiveKey = java.util.UUID.randomUUID().toString();
        var receive = Map.of(
                "idempotencyKey", receiveKey,
                "lines", java.util.List.of(Map.of(
                        "transferLineId", lineId, "receivedQuantity", 1, "discrepancyQuantity", 0)));
        request().body(receive).post("/api/transfers/" + transferId + "/receive").then().statusCode(200)
                .body("status", equalTo("received"));
        request().body(receive).post("/api/transfers/" + transferId + "/receive").then().statusCode(200);
        request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .body("[0].availabilityStatus", equalTo("available"))
                .body("[0].currentLocationId", equalTo(destinationId));
    }

    @Test
    void approvedInventoryCountPostsSignedAdjustment() {
        String locationId = request().body(Map.of("name", "Count location 001", "mapZoom", 16))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String itemId = request().body(Map.of(
                        "sku", "COUNT-BULK-001", "name", "Count bulk item", "category", "Test",
                        "amount", 2, "value", 0, "trackingMode", "bulk", "storageLocation", locationId))
                .post("/api/items").then().statusCode(200).extract().path("id");
        QuarkusTransaction.requiringNew().run(() -> {
            var position = new org.ash.inventory.model.InventoryPosition();
            position.item = entityManager.find(org.ash.inventory.model.Item.class, java.util.UUID.fromString(itemId));
            position.location = entityManager.find(org.ash.inventory.model.StorageLocation.class,
                    java.util.UUID.fromString(locationId));
            position.quantityOnHand = 2;
            entityManager.persist(position);
        });

        String countId = request().body(Map.of(
                        "locationId", locationId, "itemId", itemId, "blindCount", true))
                .post("/api/inventory-counts").then().statusCode(201)
                .body("lines[0].expectedQuantity", nullValue()).extract().path("id");
        String countLineId = request().body(Map.of()).post("/api/inventory-counts/" + countId + "/start")
                .then().statusCode(200).body("status", equalTo("counting"))
                .extract().path("lines[0].id");
        var submission = Map.of("lines", java.util.List.of(Map.of("lineId", countLineId, "quantity", 1)));
        request().body(submission).post("/api/inventory-counts/" + countId + "/submit")
                .then().statusCode(200).body("status", equalTo("awaiting_recount"));
        request().body(submission).post("/api/inventory-counts/" + countId + "/recount")
                .then().statusCode(200).body("status", equalTo("awaiting_approval"));
        request().body(Map.of()).post("/api/inventory-counts/" + countId + "/approve")
                .then().statusCode(200).body("lines[0].varianceQuantity", equalTo(-1));
        request().body(Map.of()).post("/api/inventory-counts/" + countId + "/post")
                .then().statusCode(200).body("status", equalTo("posted"));

        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("stock.totalOwned", equalTo(1)).body("stock.available", equalTo(1));
        request().queryParam("itemId", itemId).get("/api/inventory-positions").then().statusCode(200)
                .body("[0].quantityOnHand", equalTo(1));
    }

    @Test
    void expiredOutboxLeasesAreDeadLetteredAndPublishedAcksAreBatched() {
        java.util.UUID expiredId = QuarkusTransaction.requiringNew().call(() -> {
            var event = outboxEvent(DomainEnums.OutboxStatus.processing, java.time.Instant.parse("2000-01-01T00:00:00Z"));
            event.attemptCount = 10;
            entityManager.persist(event);
            entityManager.flush();
            return event.id;
        });
        domainEvents.claim(1);
        DomainEnums.OutboxStatus expiredStatus = QuarkusTransaction.requiringNew().call(() ->
                entityManager.find(DomainEvent.class, expiredId).status);
        org.junit.jupiter.api.Assertions.assertEquals(DomainEnums.OutboxStatus.dead_letter, expiredStatus);

        java.util.List<java.util.UUID> publishedIds = QuarkusTransaction.requiringNew().call(() -> {
            var first = outboxEvent(DomainEnums.OutboxStatus.processing, java.time.Instant.now().plusSeconds(3600));
            var second = outboxEvent(DomainEnums.OutboxStatus.processing, java.time.Instant.now().plusSeconds(3600));
            entityManager.persist(first);
            entityManager.persist(second);
            entityManager.flush();
            return java.util.List.of(first.id, second.id);
        });
        domainEvents.published(publishedIds);
        long publishedCount = QuarkusTransaction.requiringNew().call(() -> entityManager.createQuery("""
                select count(event) from DomainEvent event
                where event.id in :ids and event.status = :status
                """, Long.class)
                .setParameter("ids", publishedIds)
                .setParameter("status", DomainEnums.OutboxStatus.published)
                .getSingleResult());
        org.junit.jupiter.api.Assertions.assertEquals(2L, publishedCount);
    }

    private DomainEvent outboxEvent(DomainEnums.OutboxStatus status, java.time.Instant availableAt) {
        var event = new DomainEvent();
        event.eventType = "test.event";
        event.aggregateType = "test";
        event.aggregateId = java.util.UUID.randomUUID();
        event.payload = new java.util.LinkedHashMap<>();
        event.status = status;
        event.availableAt = availableAt;
        event.occurredAt = availableAt;
        return event;
    }

    @Test
    void devAuthRoleChangesAreAppliedToExistingUsers() {
        given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "role-refresh-user")
                .header("X-Actor-Role", "hq_admin")
                .get("/api/auth/me").then().statusCode(200).body("role", equalTo("hq_admin"));

        given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "role-refresh-user")
                .header("X-Actor-Role", "marshal")
                .get("/api/auth/me").then().statusCode(200).body("role", equalTo("marshal"));
    }

    @Test
    void canonicalRolesAreAuthorizedAndRemovedRoleNamesHaveNoPrivilege() {
        given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "canonical-event-planner")
                .header("X-Actor-Role", "event_planner")
                .body(Map.of("eventType", "DE", "name", "Canonical role event",
                        "startDate", "2038-09-10", "endDate", "2038-09-11", "status", "planned"))
                .post("/api/events").then().statusCode(200);

        given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "removed-role-user")
                .header("X-Actor-Role", "admin")
                .body(Map.of("sku", "REMOVED-ROLE-001", "name", "Must not be created",
                        "category", "Test", "amount", 1, "value", 0))
                .post("/api/items").then().statusCode(403);
    }

    @Test
    void reopeningPreparationReleasesReservationsAndOrderLinesRemainEditable() {
        String itemId = request().body(Map.of("sku", "REOPEN-EDIT-001", "name", "Reopen edit item",
                        "category", "Test", "amount", 2, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Reopen edit faction");
        orderBody.put("eventDate", "2037-05-10");
        orderBody.put("requestedQuantities", Map.of(itemId, 2));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String orderId = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 2), "acknowledgeShortages", false))
                .post("/api/orders/" + orderId + "/prepare").then().statusCode(200);

        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/submitted")
                .then().statusCode(200)
                .body("reservedQuantities.'" + itemId + "'", equalTo(0))
                .body("preparedQuantities.'" + itemId + "'", equalTo(0));
        orderBody.put("requestedQuantities", Map.of(itemId, 1));
        request().body(orderBody).patch("/api/orders/" + orderId).then().statusCode(200)
                .body("requestedQuantities.'" + itemId + "'", equalTo(1));
    }

    @Test
    void unopenedConsumablesReturnToStockAndConsumedUnitsDoNot() {
        String warehouseId = request().body(Map.of("name", "Consumable warehouse", "mapZoom", 16))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String eventSiteId = request().body(Map.of("name", "Consumable event site", "mapZoom", 16,
                        "latitude", 52.5, "longitude", 13.4, "locationType", "event_site"))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String itemId = request().body(Map.of("sku", "CONSUMABLE-RETURN-001", "name", "Returnable boxes",
                        "category", "Test", "amount", 4, "value", 0, "consumable", true,
                        "storageLocation", warehouseId))
                .post("/api/items").then().statusCode(200).extract().path("id");
        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Consumable return faction");
        orderBody.put("eventDate", "2037-06-10");
        orderBody.put("requestedQuantities", Map.of(itemId, 4));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String orderId = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 4), "acknowledgeShortages", false))
                .post("/api/orders/" + orderId + "/prepare").then().statusCode(200);
        request().body(Map.of("pickupLocation", eventSiteId))
                .post("/api/orders/" + orderId + "/transitions/ready").then().statusCode(200);
        String pickupCommand = java.util.UUID.randomUUID().toString();
        request().body(Map.of("idempotencyKey", pickupCommand))
                .post("/api/orders/" + orderId + "/transitions/picked_up").then().statusCode(200);

        String returnCommand = java.util.UUID.randomUUID().toString();
        request().body(Map.of("idempotencyKey", returnCommand, "lines", Map.of(itemId,
                        Map.of("returned", 2, "consumed", 2, "missing", 0, "damaged", 0))))
                .post("/api/orders/" + orderId + "/return").then().statusCode(200)
                .body("status", equalTo("returned"))
                .body("returnedQuantities.'" + itemId + "'", equalTo(2))
                .body("consumedQuantities.'" + itemId + "'", equalTo(2));

        request().get("/api/transactions?itemId=" + itemId).then().statusCode(200)
                .body("find { it.transactionType == 'checkout' }.clientCommandId", equalTo(pickupCommand))
                .body("find { it.transactionType == 'checkout' }.sourceLocationId", equalTo(warehouseId))
                .body("find { it.transactionType == 'checkout' }.destinationLocationId", equalTo(eventSiteId))
                .body("find { it.transactionType == 'checkin' }.quantityChanged", equalTo(2))
                .body("find { it.transactionType == 'checkin' }.clientCommandId", equalTo(returnCommand))
                .body("find { it.transactionType == 'checkin' }.sourceLocationId", equalTo(eventSiteId))
                .body("find { it.transactionType == 'checkin' }.destinationLocationId", equalTo(warehouseId))
                .body("find { it.transactionType == 'consumed' }.quantityChanged", equalTo(2));

        var demand = new java.util.HashMap<String, Object>(orderBody);
        demand.put("faction", "Consumable stock verification");
        demand.put("requestedQuantities", Map.of(itemId, 3));
        String nextOrder = request().body(demand).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + nextOrder + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 3), "acknowledgeShortages", false))
                .post("/api/orders/" + nextOrder + "/prepare").then().statusCode(409);
    }

    @Test
    void repairingDamageDoesNotCreatePhysicalStock() {
        String itemId = request().body(Map.of("sku", "REPAIR-STOCK-001", "name", "Repair stock item",
                        "category", "Test", "amount", 1, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String damageId = request().body(Map.of("itemId", itemId, "amount", 1,
                        "description", "Regression test damage", "severity", "high"))
                .post("/api/damage-reports").then().statusCode(200).extract().path("id");
        request().body(Map.of("status", "repaired", "amount", 1))
                .patch("/api/damage-reports/" + damageId).then().statusCode(200)
                .body("status", equalTo("repaired"));

        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Repair stock faction");
        orderBody.put("eventDate", "2037-07-10");
        orderBody.put("requestedQuantities", Map.of(itemId, 2));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String orderId = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 2), "acknowledgeShortages", false))
                .post("/api/orders/" + orderId + "/prepare").then().statusCode(409);
    }

    @Test
    void repeatedMissingDeclarationsRecordOnlyNewlyMissingUnits() {
        String itemId = request().body(Map.of("sku", "MISSING-DELTA-001", "name", "Missing delta item",
                        "category", "Test", "amount", 2, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Missing delta faction");
        orderBody.put("eventDate", "2037-08-10");
        orderBody.put("requestedQuantities", Map.of(itemId, 2));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String orderId = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 2), "acknowledgeShortages", false))
                .post("/api/orders/" + orderId + "/prepare").then().statusCode(200);
        request().body(Map.of("pickupLatitude", 52.5, "pickupLongitude", 13.4))
                .post("/api/orders/" + orderId + "/transitions/ready").then().statusCode(200);
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/picked_up").then().statusCode(200);

        for (int missing : java.util.List.of(1, 1, 2)) {
            request().body(Map.of("idempotencyKey", java.util.UUID.randomUUID().toString(), "lines", Map.of(itemId,
                            Map.of("returned", 0, "consumed", 0, "missing", missing, "damaged", 0))))
                    .post("/api/orders/" + orderId + "/return").then().statusCode(200)
                    .body("missingQuantities.'" + itemId + "'", equalTo(missing));
        }
        Object[] missingAudit = QuarkusTransaction.requiringNew().call(() -> entityManager.createQuery("""
                select count(reconciliation), sum(reconciliation.quantity)
                from ReturnReconciliation reconciliation
                where reconciliation.order.id = :orderId and reconciliation.outcome = :outcome
                """, Object[].class)
                .setParameter("orderId", java.util.UUID.fromString(orderId))
                .setParameter("outcome", org.ash.inventory.model.DomainEnums.ReconciliationOutcome.missing)
                .getSingleResult());
        org.junit.jupiter.api.Assertions.assertEquals(2L, missingAudit[0]);
        org.junit.jupiter.api.Assertions.assertEquals(2L, missingAudit[1]);
    }

    @Test
    void rejectedOfflineCommandRollsBackItsPartialAggregateChanges() {
        String itemId = request().body(Map.of("sku", "SYNC-ROLLBACK-001", "name", "Sync rollback item",
                        "category", "Test", "amount", 1, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "LS");
        orderBody.put("faction", "Sync rollback faction");
        orderBody.put("eventDate", "2036-06-01");
        orderBody.put("requestedQuantities", Map.of(itemId, 2));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String orderId = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/submitted").then().statusCode(200);

        var action = Map.of(
                "idempotencyKey", java.util.UUID.randomUUID().toString(),
                "type", "order.prepare",
                "payload", Map.of("orderId", orderId, "input", Map.of(
                        "preparedQuantities", Map.of(itemId, 2), "acknowledgeShortages", false)));
        request().body(Map.of("actions", java.util.List.of(action))).post("/api/sync")
                .then().statusCode(200).body("results[0].status", equalTo("conflict"));
        request().get("/api/orders/" + orderId).then().statusCode(200)
                .body("status", equalTo("submitted"))
                .body("reservedQuantities.'" + itemId + "'", equalTo(0));
    }

    @Test
    void reservationsPreventDoubleAllocationAndBecomeCustodyOnPickup() {
        String itemId = request()
                .body(Map.of("sku", "RESERVE-001", "name", "Reservation test radio", "category", "Comms",
                        "amount", 2, "value", 0, "trackingMode", "bulk", "inventoryRole", "returnable"))
                .post("/api/items").then().statusCode(200)
                .body("trackingMode", equalTo("bulk")).body("inventoryRole", equalTo("returnable"))
                .extract().path("id");

        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Reservation alpha");
        orderBody.put("eventDate", "2035-05-10");
        orderBody.put("requestedQuantities", Map.of(itemId, 2));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String first = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + first + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 2), "acknowledgeShortages", false))
                .post("/api/orders/" + first + "/prepare").then().statusCode(200)
                .body("reservedQuantities.'" + itemId + "'", equalTo(2));

        orderBody.put("faction", "Reservation bravo");
        orderBody.put("requestedQuantities", Map.of(itemId, 1));
        String second = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + second + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 1), "acknowledgeShortages", false))
                .post("/api/orders/" + second + "/prepare").then().statusCode(409);

        request().body(Map.of()).post("/api/orders/" + first + "/transitions/cancelled").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 1), "acknowledgeShortages", false))
                .post("/api/orders/" + second + "/prepare").then().statusCode(200);
        request().body(Map.of("pickupLatitude", 52.5, "pickupLongitude", 13.4))
                .post("/api/orders/" + second + "/transitions/ready").then().statusCode(200);
        request().body(Map.of("collectorName", "Faction Quartermaster"))
                .post("/api/orders/" + second + "/transitions/picked_up").then().statusCode(200)
                .body("reservedQuantities.'" + itemId + "'", equalTo(0))
                .body("handedOverQuantities.'" + itemId + "'", equalTo(1));
        request().body(Map.of("lines", Map.of(itemId, Map.of("returned", 1, "missing", 0, "damaged", 0))))
                .post("/api/orders/" + second + "/return").then().statusCode(200)
                .body("status", equalTo("returned"))
                .body("returnedQuantities.'" + itemId + "'", equalTo(1));
        request().body(Map.of()).post("/api/orders/" + second + "/transitions/closed").then().statusCode(200);
    }

    @Test
    void assemblyImageCanBeCreatedReplacedPreservedAndRemoved() {
        String component = request().body(Map.of("name", "Assembly image component", "category", "Equipment", "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        byte[] bytes = java.util.Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
        String staged = given().header("X-Actor-Id", "media-admin")
                .multiPart("file", "image.webp", bytes, "image/webp")
                .post("/api/media").then().statusCode(200).extract().path("key");
        var body = new java.util.HashMap<String, Object>();
        body.put("name", "Assembly with image");
        body.put("itemQuantities", Map.of(component, 1));
        body.put("image", staged);
        var created = request().body(body).post("/api/assemblies").then().statusCode(200).extract().jsonPath();
        String id = created.getString("id");
        String first = created.getString("image");
        org.junit.jupiter.api.Assertions.assertTrue(first.matches("assemblies/[0-9a-f-]{36}/" + id + "\\.webp"));
        org.junit.jupiter.api.Assertions.assertArrayEquals(bytes,
                request().get("/api/media/" + first).then().statusCode(200).contentType("image/webp").extract().asByteArray());
        request().get("/api/media/" + staged).then().statusCode(404);
        request().get("/api/assemblies/" + id).then().statusCode(200).body("image", equalTo(first));

        body.remove("image");
        body.put("description", "Unrelated edit keeps the image");
        request().body(body).patch("/api/assemblies/" + id).then().statusCode(200).body("image", equalTo(first));
        String replacement = given().header("X-Actor-Id", "media-admin")
                .multiPart("file", "image.webp", bytes, "image/webp")
                .post("/api/media").then().statusCode(200).extract().path("key");
        body.put("image", replacement);
        String second = request().body(body).patch("/api/assemblies/" + id).then().statusCode(200).extract().path("image");
        org.junit.jupiter.api.Assertions.assertNotEquals(first, second);
        org.junit.jupiter.api.Assertions.assertTrue(second.endsWith("/" + id + ".webp"));
        request().get("/api/media/" + replacement).then().statusCode(404);
        request().get("/api/media/" + first).then().statusCode(404);
        body.remove("image");
        body.put("removeImage", true);
        request().body(body).patch("/api/assemblies/" + id).then().statusCode(200).body("image", org.hamcrest.Matchers.nullValue());
        request().get("/api/assemblies/" + id).then().statusCode(200).body("image", org.hamcrest.Matchers.nullValue());
        request().get("/api/media/" + second).then().statusCode(404);
    }

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
        request().get("/api/media/" + images.get(0)).then().statusCode(404);
        request().get("/api/media/" + images.get(1)).then().statusCode(200);
        request().delete("/api/media/" + images.get(1)).then().statusCode(400);
        request().get("/api/media/" + images.get(1)).then().statusCode(200);
    }

    @Test
    void abandonedStagedImageCanBeDeleted() {
        byte[] bytes = java.util.Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
        String staged = given().header("X-Actor-Id", "media-admin")
                .multiPart("file", "image.webp", bytes, "image/webp")
                .post("/api/media").then().statusCode(200).extract().path("key");

        request().get("/api/media/" + staged).then().statusCode(200);
        request().delete("/api/media/" + staged).then().statusCode(204);
        request().get("/api/media/" + staged).then().statusCode(404);
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
                .header("X-Actor-Role", "hq_admin");
    }

    private static io.restassured.specification.RequestSpecification factionLeaderRequest() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "test-faction-leader")
                .header("X-Actor-Name", "Test Faction Leader")
                .header("X-Actor-Role", "faction_leader");
    }

    private static io.restassured.specification.RequestSpecification assignedFactionLeaderRequest() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "test-assigned-faction-leader")
                .header("X-Actor-Name", "Assigned Faction Leader")
                .header("X-Actor-Role", "faction_leader");
    }

    @Test
    void procurementDeficitsRequirePlannerAccess() {
        factionLeaderRequest()
                .get("/api/procurement/deficits")
                .then().statusCode(403);
        factionLeaderRequest().get("/api/purchase-orders").then().statusCode(403);

        given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "test-event-planner")
                .header("X-Actor-Name", "Test Event Planner")
                .header("X-Actor-Role", "event_planner")
                .get("/api/procurement/deficits")
                .then().statusCode(200);
        given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "test-event-planner")
                .header("X-Actor-Name", "Test Event Planner")
                .header("X-Actor-Role", "event_planner")
                .get("/api/purchase-orders")
                .then().statusCode(200);
    }

    @Test
    void factionLeaderCannotUseTheApiForAnUnassignedFaction() {
        String userId = assignedFactionLeaderRequest()
                .get("/api/auth/me")
                .then().statusCode(200)
                .extract().path("id");
        request()
                .body(Map.of("role", "faction_leader", "faction", java.util.List.of("DE:Allowed API faction")))
                .patch("/api/users/" + userId)
                .then().statusCode(200);

        String itemId = request()
                .body(Map.of("sku", "FACTION-ACCESS-001", "name", "Faction access item", "category", "Equipment", "amount", 2, "value", 0))
                .post("/api/items")
                .then().statusCode(200)
                .extract().path("id");
        String replacementItemId = request()
                .body(Map.of("sku", "FACTION-ACCESS-002", "name", "Faction replacement item", "category", "Equipment", "amount", 2, "value", 0))
                .post("/api/items")
                .then().statusCode(200)
                .extract().path("id");
        var assignedOrder = Map.of(
                "eventType", "DE",
                "faction", "Allowed API faction",
                "eventDate", "2034-05-06",
                "requestedQuantities", Map.of(itemId, 1),
                "requestedAssemblyQuantities", Map.of());
        var unassignedOrder = Map.of(
                "eventType", "DE",
                "faction", "Hidden API faction",
                "eventDate", "2034-05-06",
                "requestedQuantities", Map.of(itemId, 1),
                "requestedAssemblyQuantities", Map.of());

        assignedFactionLeaderRequest()
                .body(assignedOrder)
                .post("/api/orders")
                .then().statusCode(200)
                .body("faction", equalTo("Allowed API faction"));
        assignedFactionLeaderRequest()
                .body(unassignedOrder)
                .post("/api/orders")
                .then().statusCode(403);

        String adminCreatedAssignedOrderId = request()
                .body(assignedOrder)
                .post("/api/orders")
                .then().statusCode(200)
                .extract().path("id");
        var editedAssignedOrder = new java.util.HashMap<String, Object>(assignedOrder);
        editedAssignedOrder.put("requestedQuantities", Map.of(replacementItemId, 2));
        editedAssignedOrder.put("notes", "Edited by another assigned faction leader");
        assignedFactionLeaderRequest()
                .body(editedAssignedOrder)
                .patch("/api/orders/" + adminCreatedAssignedOrderId)
                .then().statusCode(200)
                .body("notes", equalTo("Edited by another assigned faction leader"))
                .body("history[-1].deltaSnapshot.addedItems", org.hamcrest.Matchers.hasEntry(replacementItemId, 2))
                .body("history[-1].deltaSnapshot.removedItems", org.hamcrest.Matchers.hasEntry(itemId, 1));

        String unassignedOrderId = request()
                .body(unassignedOrder)
                .post("/api/orders")
                .then().statusCode(200)
                .extract().path("id");
        assignedFactionLeaderRequest()
                .get("/api/orders/" + unassignedOrderId)
                .then().statusCode(403);
        assignedFactionLeaderRequest()
                .get("/api/orders")
                .then().statusCode(200)
                .body("faction", org.hamcrest.Matchers.everyItem(equalTo("Allowed API faction")));
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
                .body(Map.of("itemId", itemId, "transactionType", "checkout", "quantityChanged", 1,
                        "reason", "test", "eventType", "DE", "faction", "KGG"))
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

    @Test
    void offlineFactionOrderCreationIsReplayedIdempotently() {
        String itemId = request()
                .body(Map.of("sku", "OFFLINE-ORDER-001", "name", "Offline order item", "category", "Equipment", "amount", 3, "value", 0))
                .post("/api/items")
                .then().statusCode(200)
                .extract().path("id");

        var payload = new java.util.HashMap<String, Object>();
        payload.put("eventType", "DE");
        payload.put("faction", "Offline order test faction");
        payload.put("eventDate", "2033-05-06");
        payload.put("requestedQuantities", Map.of(itemId, 2));
        payload.put("requestedAssemblyQuantities", Map.of());
        String idempotencyKey = java.util.UUID.randomUUID().toString();
        var batch = Map.of("actions", java.util.List.of(Map.of(
                "idempotencyKey", idempotencyKey,
                "type", "order.create",
                "payload", payload)));

        String orderId = request().body(batch)
                .post("/api/sync")
                .then().statusCode(200)
                .body("results[0].status", equalTo("applied"))
                .body("results[0].entity.status", equalTo("draft"))
                .extract().path("results[0].entity.id");

        request().body(batch)
                .post("/api/sync")
                .then().statusCode(200)
                .body("results[0].status", equalTo("applied"))
                .body("results[0].entity.id", equalTo(orderId));
    }

    @Test
    void factionOrderPickupPointIsSetWhenTheOrderIsMarkedReady() {
        String itemId = request()
                .body(Map.of("sku", "PICKUP-LATE-001", "name", "Late pickup item", "category", "Equipment", "amount", 1, "value", 0))
                .post("/api/items")
                .then().statusCode(200)
                .extract().path("id");

        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Late pickup test faction");
        orderBody.put("eventDate", "2032-04-05");
        orderBody.put("requestedPickupDate", "2032-04-03");
        orderBody.put("requestedQuantities", Map.of(itemId, 1));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String orderId = request().body(orderBody)
                .post("/api/orders")
                .then().statusCode(200)
                .body("status", equalTo("draft"))
                .body("requestedPickupDate", equalTo("2032-04-03"))
                .extract().path("id");

        request().body(Map.of())
                .post("/api/orders/" + orderId + "/transitions/submitted")
                .then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 1), "acknowledgeShortages", false))
                .post("/api/orders/" + orderId + "/prepare")
                .then().statusCode(200);
        request().body(Map.of("pickupLatitude", 52.52, "pickupLongitude", 13.405))
                .post("/api/orders/" + orderId + "/transitions/ready")
                .then().statusCode(200)
                .body("status", equalTo("ready"))
                .body("pickupLatitude", equalTo(52.52f))
                .body("pickupLongitude", equalTo(13.405f));
    }

    @Test
    void overOrderedStockAppearsAsAProcurementDeficit() {
        String itemId = request()
                .body(Map.of("sku", "PROC-OVER-001", "name", "Over-ordered cable", "category", "Equipment", "amount", 10, "value", 0))
                .post("/api/items")
                .then().statusCode(200)
                .extract().path("id");

        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Procurement test faction");
        orderBody.put("eventDate", "2031-04-05");
        orderBody.put("requestedQuantities", Map.of(itemId, 15));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String eventId = request().body(orderBody)
                .post("/api/orders")
                .then().statusCode(200)
                .extract().path("eventOccurrenceId");

        request().get("/api/procurement/deficits?eventOccurrenceId=" + eventId)
                .then().statusCode(200)
                .body("size()", equalTo(1))
                .body("[0].itemId", equalTo(itemId))
                .body("[0].demand", equalTo(15))
                .body("[0].availableStock", equalTo(10))
                .body("[0].projectedStock", equalTo(-5))
                .body("[0].netDeficit", equalTo(5));
    }

    @Test
    void itemListReturnsLiveOwnedAndOnHandStockAfterCheckout() {
        String itemId = request().body(Map.of(
                        "sku", "LIVE-STOCK-001", "name", "Live stock item", "category", "Test",
                        "amount", 3, "value", 10))
                .post("/api/items").then().statusCode(200)
                .body("stock.totalOwned", equalTo(3))
                .body("stock.onHand", equalTo(3))
                .extract().path("id");

        request().body(Map.of("itemId", itemId, "transactionType", "checkout", "quantityChanged", 1))
                .post("/api/transactions").then().statusCode(400)
                .body("error", org.hamcrest.Matchers.containsString("eventType is required"));

        request().body(Map.of("itemId", itemId, "transactionType", "checkout", "quantityChanged", 1,
                        "eventType", "DE", "faction", "KGG"))
                .post("/api/transactions").then().statusCode(200)
                .body("eventType", equalTo("DE"))
                .body("faction", equalTo("KGG"));

        request().get("/api/items").then().statusCode(200)
                .body("find { it.id == '" + itemId + "' }.stock.totalOwned", equalTo(3))
                .body("find { it.id == '" + itemId + "' }.stock.onHand", equalTo(2))
                .body("find { it.id == '" + itemId + "' }.stock.checkedOut", equalTo(1))
                .body("find { it.id == '" + itemId + "' }.stock.available", equalTo(2));
    }

    @Test
    void itemListsAreBoundedAndRejectInvalidPageSizes() {
        request().body(Map.of(
                        "sku", "PAGE-ITEM-001", "name", "Pagination sentinel alpha", "category", "Test",
                        "amount", 1, "value", 0))
                .post("/api/items").then().statusCode(200);
        request().body(Map.of(
                        "sku", "PAGE-ITEM-002", "name", "Pagination sentinel beta", "category", "Test",
                        "amount", 1, "value", 0))
                .post("/api/items").then().statusCode(200);

        request().queryParam("search", "Pagination sentinel").queryParam("page", 0).queryParam("size", 1)
                .get("/api/items").then().statusCode(200).body("size()", equalTo(1));
        request().queryParam("search", "Pagination sentinel").queryParam("page", 1).queryParam("size", 1)
                .get("/api/items").then().statusCode(200).body("size()", equalTo(1));
        request().queryParam("search", "Pagination sentinel").queryParam("page", 2).queryParam("size", 1)
                .get("/api/items").then().statusCode(200).body("size()", equalTo(0));
        request().queryParam("search", "page-item-002")
                .get("/api/items").then().statusCode(200)
                .body("size()", equalTo(1))
                .body("[0].sku", equalTo("PAGE-ITEM-002"));
        request().queryParam("size", 201).get("/api/items").then().statusCode(400);
    }

    @Test
    void concurrentOrdersReceiveUniqueCodesAndListAsCompactPages() throws Exception {
        String itemId = request().body(Map.of(
                        "sku", "ORDER-CODE-RACE-001", "name", "Order code race item", "category", "Test",
                        "amount", 4, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String eventId = request().body(Map.of(
                        "eventType", "RACE", "name", "Order code race event",
                        "startDate", "2041-05-03", "endDate", "2041-05-03", "status", "planned"))
                .post("/api/events").then().statusCode(200).extract().path("id");
        String factionId = request().body(Map.of("eventType", "RACE", "name", "Order code race faction"))
                .post("/api/factions").then().statusCode(200).extract().path("id");
        var orderBody = Map.of(
                "eventOccurrenceId", eventId,
                "factionId", factionId,
                "requestedQuantities", Map.of(itemId, 1),
                "requestedAssemblyQuantities", Map.of());
        String[] orderCodes = new String[2];

        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> createOrder = () -> {
                ready.countDown();
                start.await(10, TimeUnit.SECONDS);
                return request().body(orderBody).post("/api/orders").then().statusCode(200)
                        .extract().path("orderCode");
            };
            var first = executor.submit(createOrder);
            var second = executor.submit(createOrder);
            org.junit.jupiter.api.Assertions.assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            orderCodes[0] = first.get(20, TimeUnit.SECONDS);
            orderCodes[1] = second.get(20, TimeUnit.SECONDS);
            org.junit.jupiter.api.Assertions.assertNotEquals(orderCodes[0], orderCodes[1]);
        }

        request().queryParam("orderCode", orderCodes[0].toLowerCase(java.util.Locale.ROOT))
                .get("/api/orders").then().statusCode(200)
                .body("size()", equalTo(1))
                .body("[0].orderCode", equalTo(orderCodes[0]));

        request().queryParam("eventType", "RACE").queryParam("faction", "Order code race faction")
                .queryParam("page", 0).queryParam("size", 1)
                .get("/api/orders").then().statusCode(200)
                .body("size()", equalTo(1))
                .body("[0].requestedQuantities.'" + itemId + "'", equalTo(1))
                .body("[0].history", nullValue())
                .body("[0].lines", nullValue())
                .body("[0].assetAssignments", nullValue());
    }

    @Test
    void deletingStorageLocationUnassignsItemsAndAssets() {
        String locationId = request().body(Map.of("name", "Location to delete", "mapZoom", 16))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String itemId = request().body(Map.of(
                        "sku", "DELETE-LOCATION-001", "name", "Located serialized item", "category", "Test",
                        "amount", 1, "value", 0, "trackingMode", "serialized", "storageLocation", locationId))
                .post("/api/items").then().statusCode(200).extract().path("id");

        request().delete("/api/storage-locations/" + locationId).then().statusCode(204);

        request().get("/api/storage-locations").then().statusCode(200)
                .body("find { it.id == '" + locationId + "' }", nullValue());
        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("storageLocation", nullValue())
                .body("expand.storageLocation", nullValue());
        request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .body("[0].currentLocationId", nullValue())
                .body("[0].currentLocationName", nullValue());
    }

    @Test
    void retiringItemPreservesItsTransactionHistory() {
        String itemId = request().body(Map.of(
                        "sku", "DELETE-HISTORY-001", "name", "Item with history", "category", "Test",
                        "amount", 3, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");

        request().get("/api/transactions?itemId=" + itemId).then().statusCode(200)
                .body("size()", equalTo(1));

        request().delete("/api/items/" + itemId).then().statusCode(204);

        request().get("/api/transactions?itemId=" + itemId).then().statusCode(200)
                .body("size()", equalTo(1))
                .body("[0].reason", equalTo("Initial stock"));
    }

    @Test
    void belowMinimumStockAppearsWithoutAnEventOrder() {
        String itemId = request()
                .body(Map.of("sku", "PROC-MIN-001", "name", "Minimum stock cable", "category", "Equipment",
                        "amount", 3, "minStock", 8, "value", 0))
                .post("/api/items")
                .then().statusCode(200)
                .extract().path("id");

        request().get("/api/procurement/deficits")
                .then().statusCode(200)
                .body("find { it.itemId == '" + itemId + "' }.demand", equalTo(0))
                .body("find { it.itemId == '" + itemId + "' }.totalOwnedStock", equalTo(3))
                .body("find { it.itemId == '" + itemId + "' }.netDeficit", equalTo(5));
    }

    @Test
    void damageResolutionStoresActionCommentAndItemHint() {
        String itemId = request().body(Map.of("sku", "DAMAGE-NOTES-001", "name", "Damage notes item",
                        "category", "Test", "amount", 2, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String reportId = request().body(Map.of("itemId", itemId, "amount", 2,
                        "description", "Broken latch", "severity", "medium"))
                .post("/api/damage-reports").then().statusCode(200).extract().path("id");
        request().body(Map.of("status", "repaired", "amount", 1,
                        "notes", "Replaced latch and tested fit", "itemHint", "Check latch before checkout"))
                .patch("/api/damage-reports/" + reportId).then().statusCode(200)
                .body("resolutionNotes", equalTo("Replaced latch and tested fit"));
        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("hint", equalTo("Check latch before checkout"));
        request().body(Map.of("status", "written_off", "amount", 1,
                        "notes", "Second unit could not be repaired"))
                .patch("/api/damage-reports/" + reportId).then().statusCode(200)
                .body("resolutionNotes", equalTo("Replaced latch and tested fit\nSecond unit could not be repaired"));
        request().queryParam("itemId", itemId).get("/api/damage-reports").then().statusCode(200)
                .body("[0].resolutionNotes", equalTo("Replaced latch and tested fit\nSecond unit could not be repaired"));
    }

    @Test
    void generalOrderTracksSerializedPickupAndReturn() {
        String itemId = request().body(Map.of("sku", "GENERAL-SERIAL-001", "name", "General order asset",
                        "category", "Test", "amount", 1, "value", 0, "trackingMode", "serialized"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        String assetId = request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .extract().path("[0].id");
        String eventId = request().body(Map.of("eventType", "DE", "startDate", "2037-04-10", "status", "planned"))
                .post("/api/events").then().statusCode(200).extract().path("id");
        String orderId = request().body(Map.of("name", "Stage", "purpose", "Light the stage",
                        "eventOccurrenceId", eventId, "requestedQuantities", Map.of(itemId, 1)))
                .post("/api/general-orders").then().statusCode(200).extract().path("id");
        request().get("/api/events?eventType=DE").then().statusCode(200);
        request().body(Map.of()).post("/api/general-orders/" + orderId + "/submit").then().statusCode(200);
        request().body(Map.of()).post("/api/general-orders/" + orderId + "/ready").then().statusCode(200);
        request().body(Map.of("assetAssignments", Map.of(itemId, java.util.List.of(assetId))))
                .post("/api/general-orders/" + orderId + "/pickup").then().statusCode(200)
                .body("status", equalTo("picked_up"));
        request().get("/api/events/" + eventId).then().statusCode(200)
                .body("usedQuantities.'" + itemId + "'", equalTo(1));
        request().get("/api/events?eventType=DE").then().statusCode(200)
                .body("find { it.id == '" + eventId + "' }.usedQuantities.'" + itemId + "'", equalTo(1));
        request().body(Map.of("returnedQuantities", Map.of(itemId, 1)))
                .post("/api/general-orders/" + orderId + "/return").then().statusCode(200)
                .body("status", equalTo("returned"));
        request().get("/api/events/" + eventId).then().statusCode(200)
                .body("usedQuantities.size()", equalTo(0));
        request().get("/api/items/" + itemId + "/assets").then().statusCode(200)
                .body("[0].availabilityStatus", equalTo("available"));
    }

    @Test
    void personScopedItemsAndCategoryDetailsAreOnlyVisibleToTheAssigneeAndManagers() {
        String assigneeId = factionLeaderRequest().get("/api/auth/me").then().statusCode(200)
                .extract().path("id");
        String returnLocationId = request().body(Map.of("name", "Private return shelf"))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");

        var item = new java.util.HashMap<String, Object>();
        item.put("sku", "PRIVATE-VEHICLE-001");
        item.put("name", "Private support vehicle");
        item.put("description", "Vehicle details visible to its assigned crew member.");
        item.put("category", "Vehicles");
        item.put("amount", 1);
        item.put("value", 0);
        item.put("visibilityScope", "person");
        item.put("assignedUserId", assigneeId);
        item.put("returnLocation", returnLocationId);
        item.put("fuelConsumptionLitersPer100Km", 8.5);
        item.put("batteryReplacementDue", "2027-03-01");
        String itemId = request().body(item).post("/api/items").then().statusCode(200)
                .body("description", equalTo("Vehicle details visible to its assigned crew member."))
                .body("visibilityScope", equalTo("person"))
                .body("assignedUserId", equalTo(assigneeId))
                .body("returnLocation", equalTo(returnLocationId))
                .body("fuelConsumptionLitersPer100Km", equalTo(8.5f))
                .body("batteryReplacementDue", equalTo("2027-03-01"))
                .extract().path("id");

        factionLeaderRequest().get("/api/items/" + itemId).then().statusCode(200);
        otherFactionLeaderRequest().get("/api/items/" + itemId).then().statusCode(404);
        otherFactionLeaderRequest().get("/api/items").then().statusCode(200)
                .body("find { it.id == '" + itemId + "' }", nullValue());
        request().get("/api/items/" + itemId).then().statusCode(200);
    }

    @Test
    void submittedReturnDoesNotChangeStockUntilWarehouseAcknowledgement() {
        String userId = factionLeaderRequest().get("/api/auth/me").then().statusCode(200)
                .extract().path("id");
        String locationId = request().body(Map.of("name", "Return intake counter"))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String itemId = request().body(Map.of(
                        "sku", "RETURN-STAGE-001",
                        "name", "Staged return item",
                        "category", "Equipment",
                        "amount", 2,
                        "value", 0,
                        "storageLocation", locationId,
                        "returnLocation", locationId))
                .post("/api/items").then().statusCode(200).extract().path("id");

        request().body(Map.of(
                        "itemId", itemId,
                        "transactionType", "checkout",
                        "quantityChanged", 1,
                        "userId", userId,
                        "eventType", "DE",
                        "faction", "Return test"))
                .post("/api/transactions").then().statusCode(200);

        String submissionId = factionLeaderRequest().body(Map.of(
                        "itemId", itemId,
                        "quantity", 1,
                        "notes", "Placed on the marked shelf"))
                .post("/api/returns").then().statusCode(200)
                .body("status", equalTo("pending"))
                .body("expectedReturnLocationId", equalTo(locationId))
                .extract().path("id");

        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("stock.onHand", equalTo(1))
                .body("stock.checkedOut", equalTo(1))
                .body("stock.available", equalTo(1));

        request().body(Map.of("notes", "Counted and shelved"))
                .post("/api/returns/" + submissionId + "/acknowledge").then().statusCode(200)
                .body("status", equalTo("accepted"))
                .body("acknowledgedByName", equalTo("Test Admin"));

        request().get("/api/items/" + itemId).then().statusCode(200)
                .body("stock.onHand", equalTo(2))
                .body("stock.checkedOut", equalTo(0))
                .body("stock.available", equalTo(2));
    }

    private static io.restassured.specification.RequestSpecification otherFactionLeaderRequest() {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", "other-faction-leader")
                .header("X-Actor-Name", "Other Faction Leader")
                .header("X-Actor-Role", "faction_leader");
    }
}
