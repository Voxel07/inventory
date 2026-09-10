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

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

@QuarkusTest
class InventoryApiTest {
    @Inject EntityManager entityManager;
    @Inject DomainEventService domainEvents;

    @Test
    void serializedItemsRejectQuantityOnlyStockAndPreparationCommands() {
        String itemId = request().body(Map.of("sku", "SERIAL-GUARD-001", "name", "Serialized guard item",
                        "category", "Test", "amount", 0, "value", 0, "trackingMode", "serialized"))
                .post("/api/items").then().statusCode(200).extract().path("id");
        request().body(Map.of("itemId", itemId, "transactionType", "checkout", "quantityChanged", 1))
                .post("/api/transactions").then().statusCode(409);

        var orderBody = new java.util.HashMap<String, Object>();
        orderBody.put("eventType", "DE");
        orderBody.put("faction", "Serialized guard faction");
        orderBody.put("eventDate", "2037-09-10");
        orderBody.put("requestedQuantities", Map.of(itemId, 1));
        orderBody.put("requestedAssemblyQuantities", Map.of());
        String orderId = request().body(orderBody).post("/api/orders").then().statusCode(200).extract().path("id");
        request().body(Map.of()).post("/api/orders/" + orderId + "/transitions/submitted").then().statusCode(200);
        request().body(Map.of("preparedQuantities", Map.of(itemId, 1), "acknowledgeShortages", false))
                .post("/api/orders/" + orderId + "/prepare").then().statusCode(409);
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
        body.remove("image");
        body.put("removeImage", true);
        request().body(body).patch("/api/assemblies/" + id).then().statusCode(200).body("image", org.hamcrest.Matchers.nullValue());
        request().get("/api/assemblies/" + id).then().statusCode(200).body("image", org.hamcrest.Matchers.nullValue());
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
                .post("/api/transactions").then().statusCode(200);

        request().get("/api/items").then().statusCode(200)
                .body("find { it.id == '" + itemId + "' }.stock.totalOwned", equalTo(3))
                .body("find { it.id == '" + itemId + "' }.stock.onHand", equalTo(2))
                .body("find { it.id == '" + itemId + "' }.stock.checkedOut", equalTo(1))
                .body("find { it.id == '" + itemId + "' }.stock.available", equalTo(2));
    }
}
