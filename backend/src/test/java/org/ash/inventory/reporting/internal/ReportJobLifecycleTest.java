package org.ash.inventory.reporting.internal;

import org.ash.inventory.TestLocations;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
class ReportJobLifecycleTest {
    @Inject ReportJobs jobs;
    @Inject ReportWorker worker;
    private RequestSpecification admin() { return given().contentType(ContentType.JSON).header("X-Actor-Id", "report-job-admin").header("X-Actor-Role", "admin"); }
    private void drain() { for (int job = 0; job < 16; job++) worker.runOne(); }

    @Test void requestOfAccountWithoutAccessIsReleasedForTheNextReader() {
        drain();
        jobs.enqueue("counts", UUID.randomUUID(), true); // unknown account: never authorized for reports
        assertEquals("pending", jobs.status("counts").state());
        drain();
        assertEquals("idle", jobs.status("counts").state());
        // Change a source so the next authorized read is stale and queues the rebuild under its own account.
        String location = TestLocations.section(this::admin, Map.of("name", "Report job " + UUID.randomUUID()));
        admin().body(Map.of("sku", "REPORT-JOB-" + UUID.randomUUID(), "name", "Report job item", "category", "Report job",
                "amount", 0, "trackingMode", "bulk", "storageLocation", location)).post("/api/items").then().statusCode(200);
        admin().get("/api/reports/counts").then().statusCode(200).body("stale", equalTo(true)).body("job.state", equalTo("pending"));
        drain();
        admin().get("/api/reports/counts").then().statusCode(200).body("stale", equalTo(false)).body("job.state", equalTo("completed"));
    }
}
