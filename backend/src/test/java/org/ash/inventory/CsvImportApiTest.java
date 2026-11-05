package org.ash.inventory;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.operations.internal.application.CsvImportSteps;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.junit.jupiter.api.Test;
import java.util.Map;
import java.util.UUID;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
@TestProfile(CsvImportApiTest.ManualWorker.class)
class CsvImportApiTest {
    public static class ManualWorker implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() {
            return Map.of("inventory.workers.imports.enabled", "false");
        }
    }
    @Inject ObjectMapper json;
    @Inject CsvImportSteps steps;
    @Inject EntityManager em;

    @Test void uploadIsIdempotentAndProgressPersistsBetweenWorkerCalls() {
        String owner = "csv-progress-" + UUID.randomUUID();
        var plan = plan("items");
        plan.withArray("parsedItems").add(item(1, owner + " first"));
        plan.withArray("parsedItems").add(item(2, owner + " second"));
        var upload = upload(plan);
        String id = request(owner).body(upload).post("/api/csv-imports").then().statusCode(202)
                .header("Location", containsString("/api/csv-imports/"))
                .extract().path("id");
        request(owner).body(upload).post("/api/csv-imports").then().statusCode(202).body("id", equalTo(id));
        status(owner, id).then().body("status", equalTo("queued")).body("processedRows", equalTo(0));
        assertTrue(steps.next());
        status(owner, id).then().body("status", equalTo("running")).body("processedRows", equalTo(1));
        request(owner).get("/api/csv-imports").then().statusCode(200).body("[0].processedRows", equalTo(1));
        assertTrue(steps.next());
        status(owner, id).then().body("status", equalTo("completed")).body("progress", equalTo(100))
                .body("result.successItems", equalTo(2)).body("result.errors", hasSize(0));
    }

    @Test void failedRowRollsBackItsItemAndTheNextRowStillImports() {
        String owner = "csv-rollback-" + UUID.randomUUID();
        var plan = plan("items");
        var invalid = item(1, owner + " invalid");
        invalid.putArray("lots").addObject().put("lotNumber", "cannot-book-on-bulk").put("quantity", 1);
        plan.withArray("parsedItems").add(invalid).add(item(2, owner + " valid"));
        String id = request(owner).body(upload(plan)).post("/api/csv-imports").then().statusCode(202).extract().path("id");
        steps.failed(assertThrows(CsvImportSteps.RowFailure.class, () -> steps.next()));
        request(owner).queryParam("search", owner + " invalid").get("/api/items").then().statusCode(200).body("", hasSize(0));
        status(owner, id).then().body("processedRows", equalTo(1)).body("result.errors", hasSize(1));
        assertTrue(steps.next());
        status(owner, id).then().body("status", equalTo("completed")).body("processedRows", equalTo(2))
                .body("result.successItems", equalTo(1)).body("result.errors", hasSize(1));
    }

    @Test void jobsArePrivateAndStopWhenTheSubmittersAccessRevisionChanges() {
        String owner = "csv-access-" + UUID.randomUUID();
        var plan = plan("items");
        plan.withArray("parsedItems").add(item(1, owner));
        String id = request(owner).body(upload(plan)).post("/api/csv-imports").then().statusCode(202).extract().path("id");
        request("csv-other-" + UUID.randomUUID()).get("/api/csv-imports/" + id).then().statusCode(404);
        request("csv-other-list-" + UUID.randomUUID()).get("/api/csv-imports").then().statusCode(200).body("", hasSize(0));
        QuarkusTransaction.requiringNew().run(() -> {
            var user = em.createQuery("from UserAccount where issuer = 'dev' and externalSubject = :owner", UserAccount.class)
                    .setParameter("owner", owner).getSingleResult();
            user.accessRevision++;
        });
        steps.failed(assertThrows(CsvImportSteps.RowFailure.class, () -> steps.next()));
        status(owner, id).then().body("status", equalTo("failed")).body("result.successItems", equalTo(0)).body("result.errors", hasSize(1));
    }

    @Test void combinedImportResolvesItemsCreatedByEarlierRows() {
        String owner = "csv-combined-" + UUID.randomUUID();
        var plan = plan("combined");
        plan.withArray("parsedItems").add(item(1, owner + " item"));
        var assembly = json.createObjectNode().put("index", 2).put("status", "valid");
        assembly.putObject("data").put("name", owner + " assembly").put("category", "CSV smoke");
        assembly.putArray("components").addObject().put("itemId", "csv-new-1").put("quantity", 2);
        plan.withArray("parsedAssemblies").add(assembly);
        String id = request(owner).body(upload(plan)).post("/api/csv-imports").then().statusCode(202).extract().path("id");
        assertTrue(steps.next());
        assertTrue(steps.next());
        status(owner, id).then().body("status", equalTo("completed")).body("result.successItems", equalTo(1))
                .body("result.successAssemblies", equalTo(1)).body("result.errors", hasSize(0));
    }

    private ObjectNode plan(String tab) {
        var plan = json.createObjectNode().put("tabType", tab).put("updateExistingItems", false).put("autoCreateLocations", true);
        for (String section : new String[]{"newFactions", "parsedItems", "parsedAssemblies", "parsedEvents", "parsedOrders",
                "parsedGeneralOrders", "parsedReturns", "parsedCheckouts", "parsedOperations"}) plan.putArray(section);
        return plan;
    }
    private ObjectNode item(int index, String name) {
        var row = json.createObjectNode().put("index", index).put("status", "valid").put("isExisting", false);
        row.putObject("data").put("name", name).put("category", "CSV smoke").put("trackingMode", "bulk").put("amount", 0);
        return row;
    }
    private Map<String, Object> upload(ObjectNode plan) {
        return Map.of("commandId", UUID.randomUUID(), "filename", "smoke.csv", "timezone", "Europe/Berlin", "plan", plan);
    }
    private io.restassured.response.Response status(String owner, String id) {
        var response = request(owner).get("/api/csv-imports/" + id);
        response.then().statusCode(200);
        return response;
    }
    private RequestSpecification request(String owner) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", owner).header("X-Actor-Role", "admin");
    }
}
