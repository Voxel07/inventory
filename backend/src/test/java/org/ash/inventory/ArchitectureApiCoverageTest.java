package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.helper.BusinessTime;
import org.ash.inventory.helper.event.EventBroadcaster;
import org.ash.inventory.model.*;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

/** Successful HTTP workflows missing from the older regression suites, plus their policy boundaries. */
@QuarkusTest
class ArchitectureApiCoverageTest {
    @Inject EntityManager em;
    @Inject EventBroadcaster broadcaster;

    private RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "architecture-" + name)
                .header("X-Actor-Name", "Architecture " + name).header("X-Actor-Role", role);
    }
    private RequestSpecification admin() { return actor("admin", "hq_admin"); }
    private RequestSpecification reader() { return actor("reader", "read_only"); }
    private String location() {
        return admin().body(Map.of("name", "Architecture shelf " + UUID.randomUUID()))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
    }
    private String item(String location, int amount, String mode) {
        return admin().body(Map.of("name", "Architecture equipment", "sku", "ARC-" + UUID.randomUUID(),
                "category", "Architecture", "storageLocation", location, "amount", amount, "trackingMode", mode))
                .post("/api/items").then().statusCode(200).extract().path("id");
    }
    private Map<String, Object> transaction(String item, String user) {
        var input = new HashMap<String, Object>(Map.of("itemId", item, "transactionType", "checkout",
                "quantityChanged", 1, "eventType", "DE", "faction", "Architecture", "idempotencyKey", UUID.randomUUID()));
        if (user != null) input.put("userId", user);
        return input;
    }

    @Test void warehouseAndLocationAdministrationPreservesHierarchyAndRetirement() {
        String code = "ARC-" + UUID.randomUUID();
        String warehouse = admin().body(Map.of("code", code, "name", "Review warehouse"))
                .post("/api/warehouses").then().statusCode(201).extract().path("id");
        reader().body(Map.of("code", code, "name", "Unauthorized"))
                .put("/api/warehouses/" + warehouse).then().statusCode(403);
        admin().body(Map.of("code", code, "name", "Updated warehouse", "active", true))
                .put("/api/warehouses/" + warehouse).then().statusCode(200).body("name", equalTo("Updated warehouse"));
        reader().get("/api/warehouses?size=200").then().statusCode(200).body("id", hasItem(warehouse));
        String shelf = admin().body(Map.of("name", "Initial shelf", "warehouseId", warehouse))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        admin().body(Map.of("name", "Mapped shelf", "warehouseId", warehouse, "latitude", 52.5, "longitude", 13.4))
                .patch("/api/storage-locations/" + shelf).then().statusCode(200);
        reader().get("/api/storage-locations/" + shelf).then().statusCode(200)
                .body("name", equalTo("Mapped shelf")).body("latitude", equalTo(52.5f));
        admin().delete("/api/warehouses/" + warehouse).then().statusCode(409);
        admin().delete("/api/storage-locations/" + shelf).then().statusCode(204);
        admin().delete("/api/warehouses/" + warehouse).then().statusCode(204);
        admin().get("/api/warehouses?size=200").then().statusCode(200)
                .body("find { it.id == '" + warehouse + "' }.active", equalTo(false));
    }

    @Test void assemblyEditsReuseComponentsAndRemoveOnlyOmittedOnes() {
        String shelf = location(), first = item(shelf, 5, "bulk"), second = item(shelf, 3, "bulk"), third = item(shelf, 2, "bulk");
        String assembly = admin().body(Map.of("name", "Review kit", "itemQuantities", Map.of(first, 2, second, 1)))
                .post("/api/assemblies").then().statusCode(200).extract().path("id");
        admin().body(Map.of("name", "Updated kit", "itemQuantities", Map.of(first, 3, third, 2)))
                .patch("/api/assemblies/" + assembly).then().statusCode(200)
                .body("itemQuantities.'" + first + "'", equalTo(3)).body("itemQuantities.'" + third + "'", equalTo(2))
                .body("itemIds", not(hasItem(second)));
        admin().body(Map.of("name", "Invalid kit", "itemQuantities", Map.of(first, 0)))
                .patch("/api/assemblies/" + assembly).then().statusCode(400);
        reader().get("/api/assemblies/" + assembly).then().statusCode(200).body("name", equalTo("Updated kit"));
        admin().delete("/api/assemblies/" + assembly).then().statusCode(204);
        reader().get("/api/assemblies/" + assembly).then().statusCode(404);
        reader().get("/api/items/" + first).then().statusCode(200).body("stock.onHand", equalTo(5));
    }

    @Test void assetMetadataConditionAndWriteOffUseVersionAndLedger() {
        String shelf = location(), id = item(shelf, 1, "serialized");
        var asset = admin().get("/api/items/" + id + "/assets").then().statusCode(200).extract().jsonPath();
        String assetId = asset.getString("[0].id"), code = asset.getString("[0].assetCode");
        long version = asset.getLong("[0].version");
        reader().get("/api/assets/by-code/" + code.toLowerCase(Locale.ROOT)).then().statusCode(200).body("id", equalTo(assetId));
        String path = "/api/items/" + id + "/assets/" + assetId;
        long updated = admin().body(Map.of("serialNumber", "ARC-SERIAL", "notes", "Inspection", "expectedVersion", version))
                .patch(path).then().statusCode(200).body("serialNumber", equalTo("ARC-SERIAL")).extract().jsonPath().getLong("version");
        admin().body(Map.of("conditionStatus", "good", "expectedVersion", version)).post(path + "/condition").then().statusCode(409);
        admin().body(Map.of("conditionStatus", "good", "expectedVersion", updated)).post(path + "/condition").then().statusCode(200);
        admin().queryParam("itemId", id).get("/api/inventory-assets").then().statusCode(200).body("id", hasItem(assetId));
        reader().delete(path).then().statusCode(403);
        admin().delete(path).then().statusCode(204);
        admin().delete(path).then().statusCode(204);
        admin().get("/api/items/" + id).then().statusCode(200).body("stock.onHand", equalTo(0)).body("stock.totalOwned", equalTo(0));
        admin().queryParam("itemId", id).get("/api/transactions").then().statusCode(200)
                .body("findAll { it.transactionType == 'written_off' }.size()", equalTo(1));
    }

    @Test void labelsRemainUniqueAndRetiredAliasesReturnGone() {
        String id = item(location(), 1, "bulk"), value = "ARC-LABEL-" + UUID.randomUUID();
        var input = new HashMap<String, Object>(Map.of("code", value, "targetType", "product", "targetId", id, "primaryCode", true));
        String label = admin().body(input).post("/api/inventory-codes").then().statusCode(201).extract().path("id");
        admin().body(input).put("/api/inventory-codes/" + label).then().statusCode(200).body("primaryCode", equalTo(true));
        admin().queryParam("targetId", id).get("/api/inventory-codes").then().statusCode(200).body("id", hasItem(label));
        input.put("code", value + "-NEW");
        admin().body(input).put("/api/inventory-codes/" + label).then().statusCode(409);
        String replacement = admin().body(input).post("/api/inventory-codes/" + label + "/replace")
                .then().statusCode(200).extract().path("id");
        reader().get("/api/inventory-codes/resolve/" + value).then().statusCode(410);
        reader().get("/api/inventory-codes/resolve/" + input.get("code")).then().statusCode(200).body("targetId", equalTo(id));
        admin().body(Map.of("code", value, "targetType", "product", "targetId", id)).post("/api/inventory-codes").then().statusCode(409);
        admin().delete("/api/inventory-codes/" + replacement).then().statusCode(204);
        reader().get("/api/inventory-codes/resolve/" + input.get("code")).then().statusCode(410);
    }

    @Test void lotAndScheduleListsRetainTheirStateAndPolicy() {
        String id = item(location(), 0, "lot_tracked");
        String lot = admin().body(Map.of("itemId", id, "lotNumber", "ARC-LOT", "status", "hold"))
                .post("/api/inventory-lots").then().statusCode(201).extract().path("id");
        reader().queryParam("itemId", id).get("/api/inventory-lots").then().statusCode(200)
                .body("find { it.id == '" + lot + "' }.status", equalTo("hold"));
        var input = new HashMap<String, Object>(Map.of("itemId", id, "maintenanceType", "battery_test", "intervalType", "date",
                "intervalValue", 30, "checkoutBlocking", true, "nextDueAt", Instant.now().plus(Duration.ofDays(20)).toString()));
        String schedule = admin().body(input).post("/api/maintenance-schedules").then().statusCode(201).extract().path("id");
        input.put("intervalValue", 60);
        reader().body(input).put("/api/maintenance-schedules/" + schedule).then().statusCode(403);
        admin().body(input).put("/api/maintenance-schedules/" + schedule).then().statusCode(200).body("intervalValue", equalTo(60.0f));
        admin().queryParam("itemId", id).get("/api/maintenance-schedules").then().statusCode(200).body("id", hasItem(schedule));
        admin().get("/api/category-maintenance").then().statusCode(200);
        admin().get("/api/repairs").then().statusCode(200);
        admin().delete("/api/maintenance-schedules/" + schedule).then().statusCode(204);
        admin().queryParam("itemId", id).get("/api/maintenance-schedules").then().statusCode(200)
                .body("find { it.id == '" + schedule + "' }.active", equalTo(false));
    }

    @Test void cancellingCountAndTransferDoesNotMoveStock() {
        String shelf = location(), id = item(shelf, 3, "bulk");
        String count = admin().body(Map.of("itemId", id, "blindCount", true)).post("/api/inventory-counts")
                .then().statusCode(201).extract().path("id");
        admin().body(Map.of("notes", "Cancelled before counting")).post("/api/inventory-counts/" + count + "/cancel")
                .then().statusCode(200).body("status", equalTo("cancelled"));
        admin().body(Map.of()).post("/api/inventory-counts/" + count + "/post").then().statusCode(409);
        String transfer = admin().body(Map.of("sourceLocationId", shelf, "destinationLocationId", location(), "idempotencyKey", UUID.randomUUID(),
                "lines", List.of(Map.of("itemId", id, "quantity", 2))))
                .post("/api/transfers").then().statusCode(201).extract().path("id");
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/transfers/" + transfer + "/cancel")
                .then().statusCode(200).body("status", equalTo("cancelled"));
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/transfers/" + transfer + "/dispatch").then().statusCode(409);
        admin().get("/api/items/" + id).then().statusCode(200).body("stock.onHand", equalTo(3)).body("stock.inTransit", equalTo(0));
    }

    @Test void procurementEditsAndVendorDocumentsRequireHqAccess() {
        String id = item(location(), 0, "bulk"), name = "Architecture supplier " + UUID.randomUUID();
        String vendor = admin().body(Map.of("name", name)).post("/api/vendors").then().statusCode(201).extract().path("id");
        admin().body(Map.of("name", name, "contactPerson", "Buyer")).put("/api/vendors/" + vendor)
                .then().statusCode(200).body("contactPerson", equalTo("Buyer"));
        admin().get("/api/vendors?size=200").then().statusCode(200).body("id", hasItem(vendor));
        var input = new HashMap<String, Object>(Map.of("vendorId", vendor, "lines", List.of(Map.of("itemId", id, "orderedQuantity", 2, "unitPriceCents", 500))));
        String purchase = admin().body(input).post("/api/purchase-orders").then().statusCode(201).extract().path("id");
        input.put("lines", List.of(Map.of("itemId", id, "orderedQuantity", 4, "unitPriceCents", 600)));
        admin().body(input).put("/api/purchase-orders/" + purchase).then().statusCode(200)
                .body("lines[0].orderedQuantity", equalTo(4)).body("lines.size()", equalTo(1));
        String staged = given().header("X-Actor-Id", "architecture-admin").header("X-Actor-Role", "hq_admin")
                .multiPart("file", "invoice.pdf", "%PDF-1.7\nreview".getBytes(java.nio.charset.StandardCharsets.UTF_8), "application/pdf")
                .post("/api/media").then().statusCode(200).extract().path("key");
        var document = Map.of("vendorId", vendor, "purchaseOrderId", purchase, "documentType", "invoice",
                "originalFilename", "invoice.pdf", "stagedObjectKey", staged);
        reader().body(document).post("/api/vendor-documents").then().statusCode(403);
        String doc = admin().body(document).post("/api/vendor-documents").then().statusCode(201)
                .body("mimeType", equalTo("application/pdf")).extract().path("id");
        reader().get("/api/vendor-documents").then().statusCode(403);
        admin().queryParam("vendorId", vendor).get("/api/vendor-documents").then().statusCode(200).body("id", hasItem(doc));
        admin().delete("/api/vendors/" + vendor).then().statusCode(204);
        admin().body(input).post("/api/purchase-orders").then().statusCode(409);
    }

    @Test void memberStorageRequestsRemindersAndReturnsAreRecipientScopedAndIdempotent() {
        var member = actor("member", "faction_leader");
        String user = member.get("/api/auth/me").then().statusCode(200).extract().path("id");
        String shelf = location(), id = item(shelf, 3, "bulk");
        reader().body(Map.of("userId", user)).put("/api/member/assignments/" + shelf).then().statusCode(403);
        admin().body(Map.of("userId", user)).put("/api/member/assignments/" + shelf).then().statusCode(204);
        admin().get("/api/member/assignments").then().statusCode(200)
                .body("find { it.id == '" + shelf + "' }.userId", equalTo(user));
        actor("member", "faction_leader").get("/api/member/storage").then().statusCode(200).body("itemId", hasItem(id));
        reader().get("/api/member/storage").then().statusCode(200).body("itemId", not(hasItem(id)));
        var request = Map.of("itemId", id, "locationId", shelf, "kind", "pickup", "quantity", 1,
                "notes", "Collect assigned equipment", "commandId", UUID.randomUUID());
        String requestId = actor("member", "faction_leader").body(request).post("/api/member/requests")
                .then().statusCode(200).extract().path("id");
        actor("member", "faction_leader").body(request).post("/api/member/requests").then().statusCode(200).body("id", equalTo(requestId));
        actor("other-member", "faction_leader").body(request).post("/api/member/requests").then().statusCode(409);
        actor("other-member", "faction_leader").get("/api/member/requests").then().statusCode(200).body("id", not(hasItem(requestId)));
        String key = "request:" + requestId, remind = Instant.now().plus(Duration.ofDays(1)).toString();
        actor("member", "faction_leader").body(Map.of("key", key, "remindAt", remind)).put("/api/action-inbox/reminder").then().statusCode(204);
        actor("member", "faction_leader").get("/api/action-inbox").then().statusCode(200)
                .body("find { it.key == '" + key + "' }.remindAt", notNullValue());
        actor("other-member", "faction_leader").body(Map.of("key", key, "remindAt", remind))
                .put("/api/action-inbox/reminder").then().statusCode(404);
        long revision = admin().get("/api/member/requests").then().statusCode(200).extract().jsonPath()
                .getLong("find { it.id == '" + requestId + "' }.revision");
        var decision = Map.of("revision", revision, "response", "Collection arranged", "resolved", true);
        reader().body(decision).post("/api/member/requests/" + requestId).then().statusCode(403);
        admin().body(decision).post("/api/member/requests/" + requestId).then().statusCode(200).body("status", equalTo("resolved"));
        admin().body(decision).post("/api/member/requests/" + requestId).then().statusCode(409);
        actor("member", "faction_leader").get("/api/action-inbox").then().statusCode(200).body("key", not(hasItem(key)));
        admin().body(transaction(id, user)).post("/api/transactions").then().statusCode(200);
        String custody = actor("member", "faction_leader").get("/api/member/custody").then().statusCode(200)
                .extract().path("find { it.itemId == '" + id + "' }.key");
        reader().get("/api/member/custody").then().statusCode(200).body("itemId", not(hasItem(id)));
        var returns = Map.of("custodyKey", custody, "quantity", 1, "commandId", UUID.randomUUID(), "notes", "Placed on assigned shelf");
        String submission = actor("member", "faction_leader").body(returns).post("/api/member/returns").then().statusCode(200).extract().path("id");
        actor("member", "faction_leader").body(returns).post("/api/member/returns").then().statusCode(200).body("id", equalTo(submission));
        admin().get("/api/items/" + id).then().statusCode(200).body("stock.onHand", equalTo(2)).body("stock.checkedOut", equalTo(1));
        admin().body(Map.of()).post("/api/returns/" + submission + "/acknowledge").then().statusCode(200);
        admin().get("/api/items/" + id).then().statusCode(200).body("stock.onHand", equalTo(3)).body("stock.checkedOut", equalTo(0));
    }

    @Test void batchTransactionsAreAtomicAndAuditIsRestrictedToAdministrators() {
        String first = item(location(), 2, "bulk"), second = item(location(), 0, "bulk");
        var one = transaction(first, null); var two = transaction(second, null);
        admin().body(List.of(one, two)).post("/api/transactions/batch").then().statusCode(409);
        admin().get("/api/items/" + first).then().statusCode(200).body("stock.onHand", equalTo(2));
        admin().body(List.of(one)).post("/api/transactions/batch").then().statusCode(200).body("size()", equalTo(1));
        admin().body(List.of(one)).post("/api/transactions/batch").then().statusCode(200);
        admin().get("/api/items/" + first).then().statusCode(200).body("stock.onHand", equalTo(1));
        admin().get("/api/sync/audit?size=10").then().statusCode(200);
        reader().get("/api/sync/audit").then().statusCode(403);
        admin().get("/api/reports").then().statusCode(200).body("size()", equalTo(8));
    }

    @Test void custodyEvidenceAndNotificationsKeepTheOriginalRecipient() {
        String creator = actor("order-owner", "faction_leader").get("/api/auth/me").then().statusCode(200).extract().path("id");
        String id = item(location(), 2, "bulk"), faction = "Architecture " + UUID.randomUUID();
        String order = admin().body(Map.of("eventType", "DE", "faction", faction, "eventDate", "2039-06-12", "requestedQuantities", Map.of(id, 1)))
                .post("/api/orders").then().statusCode(200).extract().path("id");
        admin().body(Map.of()).post("/api/orders/" + order + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(id, 1))).post("/api/orders/" + order + "/prepare").then().statusCode(200);
        admin().body(Map.of("pickupLatitude", 52.5, "pickupLongitude", 13.4)).post("/api/orders/" + order + "/transitions/ready").then().statusCode(200);
        admin().body(Map.of()).post("/api/orders/" + order + "/transitions/picked_up").then().statusCode(200);
        admin().get("/api/orders/" + order + "/handovers").then().statusCode(200).body("size()", equalTo(1));
        admin().body(Map.of("lines", Map.of(id, Map.of("returned", 1, "consumed", 0, "damaged", 0, "missing", 0))))
                .post("/api/orders/" + order + "/return").then().statusCode(200);
        admin().get("/api/orders/" + order + "/reconciliations").then().statusCode(200).body("size()", equalTo(1));
        String notification = QuarkusTransaction.requiringNew().call(() -> {
            var n = new Notification(); n.recipient = em.find(UserAccount.class, UUID.fromString(creator)); n.type = "architecture.review";
            em.persist(n); return n.id.toString();
        });
        reader().get("/api/notifications").then().statusCode(200).body("id", not(hasItem(notification)));
        reader().patch("/api/notifications/" + notification + "/read").then().statusCode(404);
        actor("order-owner", "faction_leader").get("/api/notifications").then().statusCode(200).body("id", hasItem(notification));
        actor("order-owner", "faction_leader").patch("/api/notifications/" + notification + "/read").then().statusCode(200).body("readAt", notNullValue());
    }

    @Test void deadLetterRecoveryHasAdminGuardAndResetsDeliveryState() {
        String id = QuarkusTransaction.requiringNew().call(() -> {
            var event = new DomainEvent(); event.eventType = "architecture.review"; event.aggregateType = "review";
            event.aggregateId = UUID.randomUUID(); event.status = DomainEnums.OutboxStatus.dead_letter;
            event.attemptCount = 10; event.lastError = "Delivery failed"; em.persist(event); return event.id.toString();
        });
        reader().get("/api/outbox/status").then().statusCode(403);
        reader().get("/api/outbox/dead-letters").then().statusCode(403);
        reader().post("/api/outbox/dead-letters/" + id + "/retry").then().statusCode(403);
        admin().get("/api/outbox/status").then().statusCode(200).body("counts.dead_letter", greaterThanOrEqualTo(1));
        admin().get("/api/outbox/dead-letters").then().statusCode(200).body("id", hasItem(id));
        admin().post("/api/outbox/dead-letters/" + id + "/retry").then().statusCode(200)
                .body("attemptCount", equalTo(0)).body("lastError", nullValue());
        admin().post("/api/outbox/dead-letters/" + UUID.randomUUID() + "/retry").then().statusCode(404);
    }

    @Test void accountListsAndDevelopmentLoginFollowCurrentContracts() {
        String email = "review-" + UUID.randomUUID() + "@example.test";
        String user = admin().body(Map.of("email", email)).post("/api/auth/dev-login").then().statusCode(200)
                .body("token", equalTo("dev:" + email)).extract().path("user.id");
        admin().body(Map.of("email", email)).post("/api/auth/dev-login").then().statusCode(200).body("user.id", equalTo(user));
        admin().get("/api/users?size=200").then().statusCode(200).body("id", hasItem(user));
        reader().get("/api/users").then().statusCode(403);
        admin().get("/api/users/assignable?size=200").then().statusCode(200).body("id", hasItem(user));
        reader().get("/api/users/assignable").then().statusCode(403);
    }

    @Test void loanExtensionsCheckRevisionAndKeepBothConsentDates() {
        String provider = location(), id = item(provider, 1, "bulk");
        admin().body(Map.of("ownershipType", "external", "ownerName", "Review provider", "availabilityPolicy", "commitment_required",
                "revision", 0, "reason", "Provider agreement")).put("/api/items/" + id + "/equipment").then().statusCode(200);
        LocalDate today = BusinessTime.today();
        var commitmentInput = new HashMap<String, Object>(Map.of("quantity", 1, "availableFrom", today.toString(),
                "availableUntil", today.plusDays(2).toString(), "returnDue", today.plusDays(3).toString(), "pickupDetails", "Provider shelf",
                "returnDetails", "Same shelf", "notes", "Provider consent", "revision", 1));
        String commitment = admin().body(commitmentInput).post("/api/items/" + id + "/equipment/commitments")
                .then().statusCode(200).extract().path("commitments[0].id");
        var loan = admin().body(Map.of("commitmentId", commitment, "providerLocationId", provider, "kind", "borrow",
                "provider", "Review provider", "contact", "Warehouse", "terms", "Return to owner"))
                .post("/api/loans").then().statusCode(200).extract().jsonPath();
        String path = "/api/loans/" + loan.getString("id") + "/extend";
        var extension = Map.of("revision", loan.getLong("revision"), "availableUntil", today.plusDays(4).toString(),
                "returnDue", today.plusDays(5).toString(), "reason", "Owner agreed to two more days");
        reader().body(extension).post(path).then().statusCode(403);
        admin().body(extension).post(path).then().statusCode(200).body("returnDue", equalTo(today.plusDays(5).toString()))
                .body("history.action", hasItem("extended"));
        admin().body(extension).post(path).then().statusCode(409);
    }

    @Test void sseDispatchesOnlyPublicEventClassification() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + io.restassured.RestAssured.port + "/api/events/stream"))
                .header("X-Actor-Id", "architecture-reader").header("X-Actor-Role", "read_only")
                .header("Accept", "text/event-stream").timeout(Duration.ofSeconds(10)).build();
        try (var client = HttpClient.newHttpClient()) {
            var response = client.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream()).get(10, TimeUnit.SECONDS);
            assertEquals(200, response.statusCode());
            try (var body = response.body(); var lines = new BufferedReader(new InputStreamReader(body));
                    var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                var data = executor.submit(() -> {
                    String line;
                    while ((line = lines.readLine()) != null) if (line.startsWith("data:") && line.contains("access.changed")) return line;
                    throw new AssertionError("SSE closed without an access event");
                });
                broadcaster.broadcast("access.revoked", Map.of("aggregateId", UUID.randomUUID(), "actorId", "secret-actor", "quantity", 99));
                String line = data.get(5, TimeUnit.SECONDS);
                assertEquals(Map.of("type", "access.changed"), new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                        line.substring(5).trim(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}));
            }
        }
    }
}
