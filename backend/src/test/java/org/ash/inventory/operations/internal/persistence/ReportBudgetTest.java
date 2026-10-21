package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.TestLocations;
import org.ash.inventory.operations.internal.model.StockTransaction;
import org.ash.inventory.platform.api.ApiException;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** Ledger history invalidates reports; it must not count against the rows a report materializes. */
@QuarkusTest
@TestProfile(ReportBudgetTest.SmallBudget.class)
class ReportBudgetTest {
    public static class SmallBudget implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() { return Map.of("inventory.reports.max-source-rows", "5"); }
    }
    @Inject ReportSourceOrm reports;
    private RequestSpecification admin() { return given().contentType(ContentType.JSON).header("X-Actor-Id", "report-budget-admin").header("X-Actor-Role", "admin"); }

    @Test void ledgerGrowthDoesNotExhaustReportBudgets() {
        String location = TestLocations.section(this::admin, Map.of("name", "Report budget " + UUID.randomUUID()));
        String item = admin().body(Map.of("sku", "BUDGET-" + UUID.randomUUID(), "name", "Report budget item", "category", "Report budget",
                "amount", 0, "trackingMode", "bulk", "storageLocation", location)).post("/api/items").then().statusCode(200).extract().path("id");
        for (int i = 0; i < 6; i++)
            admin().body(Map.of("itemId", item, "transactionType", "added", "quantityChanged", 1, "reason", "Budget", "locationId", location))
                    .post("/api/transactions").then().statusCode(200);
        QuarkusTransaction.requiringNew().run(() -> {
            for (var report : ReportSources.TABLES.keySet()) assertDoesNotThrow(() -> reports.assertBudget(report), report);
            // Materialized source rows remain bounded.
            assertEquals(413, assertThrows(ApiException.class, () -> reports.all(StockTransaction.class)).status);
        });
    }
}
