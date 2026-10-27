package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;

/** Administrators act as another account; the account is the actor, the administrator stays on the audit record. */
@QuarkusTest
@TestProfile(ImpersonationApiTest.Enabled.class)
class ImpersonationApiTest {
    public static class Enabled implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() {
            return Map.of("inventory.impersonation.enabled", "true");
        }
    }

    @Inject EntityManager em;

    private static RequestSpecification actor(String id, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", id).header("X-Actor-Name", "Impersonation " + id)
                .header("X-Actor-Role", role);
    }

    private static String account(String id, String role) {
        return actor(id, role).get("/api/auth/me").then().statusCode(200).extract().path("id");
    }

    @Test void administratorsActAsTheTargetAndEventsRecordTheAdministrator() {
        String suffix = UUID.randomUUID().toString();
        String admin = account("impersonating-admin-" + suffix, "admin");
        String crew = account("impersonated-crew-" + suffix, "warehouse_crew");

        actor("impersonating-admin-" + suffix, "admin").header("X-Impersonate-User", crew)
                .get("/api/auth/me").then().statusCode(200).body("id", equalTo(crew)).body("role", equalTo("warehouse_crew"));

        String location = TestLocations.section(() -> actor("impersonating-admin-" + suffix, "admin"),
                Map.of("name", "Impersonation shelf " + suffix));
        String item = actor("impersonating-admin-" + suffix, "admin").header("X-Impersonate-User", crew)
                .body(Map.of("name", "Impersonated item " + suffix, "category", "Impersonation", "amount", 1, "storageLocation", location))
                .post("/api/items").then().statusCode(200).extract().path("id");

        var row = QuarkusTransaction.requiringNew().call(() -> (Object[]) em.createNativeQuery(
                "select cast(actor_id as text), cast(impersonator_id as text) from domain_event_outbox"
                        + " where aggregate_id = cast(:item as uuid) order by occurred_at limit 1")
                .setParameter("item", item).getSingleResult());
        assertEquals(crew, row[0]);
        assertEquals(admin, row[1]);
    }

    @Test void onlyAdministratorsImpersonateExistingActiveAccounts() {
        String suffix = UUID.randomUUID().toString();
        String admin = "guard-admin-" + suffix;
        account(admin, "admin");
        String reader = account("guard-reader-" + suffix, "read_only");

        actor("guard-crew-" + suffix, "warehouse_crew").header("X-Impersonate-User", reader)
                .get("/api/auth/me").then().statusCode(403);
        actor(admin, "admin").header("X-Impersonate-User", "not-a-uuid").get("/api/auth/me").then().statusCode(400);
        actor(admin, "admin").header("X-Impersonate-User", UUID.randomUUID().toString()).get("/api/auth/me").then().statusCode(404);

        long revision = actor(admin, "admin").get("/api/users/" + reader + "/lifecycle").then().statusCode(200)
                .extract().jsonPath().getLong("revision");
        actor(admin, "admin").body(Map.of("active", false, "revision", revision, "reason", "Impersonation test"))
                .patch("/api/users/" + reader + "/lifecycle").then().statusCode(204);
        actor(admin, "admin").header("X-Impersonate-User", reader).get("/api/auth/me").then().statusCode(409);
    }
}
