package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;

@QuarkusTest
class UserAccessPersistenceTest {
    private RequestSpecification actor(String subject, String roles) {
        return given().contentType(ContentType.JSON)
                .header("X-Actor-Id", subject).header("X-Actor-Role", roles);
    }

    @Test
    void highestRoleHeaderDoesNotRemoveOtherSavedRoles() {
        String subject = UUID.randomUUID() + "@localhost";
        var initial = actor(subject, "admin").get("/api/auth/me").then().statusCode(200).extract();
        String id = initial.path("id");
        long revision = ((Number) initial.path("revision")).longValue();
        actor(subject, "admin").body(Map.of("roles", List.of("admin", "faction_leader"),
                        "factions", List.of("LS:tera"), "revision", revision, "reason", "Add faction leadership"))
                .patch("/api/users/" + id).then().statusCode(200)
                .body("roles", contains("faction_leader", "admin"));

        // The browser sends the highest effective role, not every assigned role.
        for (int read = 0; read < 2; read++) {
            actor(subject, "admin").get("/api/auth/me").then().statusCode(200)
                    .body("roles", contains("faction_leader", "admin"))
                    .body("role", equalTo("admin"))
                    .body("faction", contains("LS:tera"))
                    .body("revision", equalTo((int) revision + 1));
        }
    }

    @Test
    void savedDemotionAndMembershipsOverrideStaleDevelopmentHeaders() {
        String admin = UUID.randomUUID() + "@localhost";
        String subject = UUID.randomUUID() + "@localhost";
        var initial = actor(subject, "admin").get("/api/auth/me").then().statusCode(200).extract();
        String id = initial.path("id");
        long revision = ((Number) initial.path("revision")).longValue();
        actor(admin, "admin").body(Map.of("roles", List.of("faction_leader"),
                        "factions", List.of("LS:tera"), "revision", revision, "reason", "Assign faction-only access"))
                .patch("/api/users/" + id).then().statusCode(200);

        actor(subject, "admin").header("X-Actor-Factions", "LS:ucrf")
                .get("/api/auth/me").then().statusCode(200)
                .body("roles", contains("faction_leader"))
                .body("role", equalTo("faction_leader"))
                .body("faction", contains("LS:tera"))
                .body("revision", equalTo((int) revision + 1));
        actor(subject, "admin").get("/api/users").then().statusCode(403);
    }

    @Test
    void developmentHeadersOnlyGrantInitialAccess() {
        String subject = UUID.randomUUID() + "@localhost";
        actor(subject, "read_only,faction_leader").header("X-Actor-Factions", "LS:tera")
                .get("/api/auth/me").then().statusCode(200)
                .body("roles", contains("read_only", "faction_leader"))
                .body("role", equalTo("faction_leader"))
                .body("faction", contains("LS:tera"));

        actor(subject, "admin").header("X-Actor-Factions", "LS:ucrf")
                .get("/api/auth/me").then().statusCode(200)
                .body("roles", contains("read_only", "faction_leader"))
                .body("faction", contains("LS:tera"));
    }
}
