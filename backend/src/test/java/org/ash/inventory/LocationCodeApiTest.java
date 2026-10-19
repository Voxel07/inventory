package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/** Sibling codes and parent placement must not reveal or reach into another account's private locations. */
@QuarkusTest
class LocationCodeApiTest {
    private RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "location-code-" + name)
                .header("X-Actor-Name", "location-code-" + name).header("X-Actor-Role", role);
    }

    private static String code() { return "C" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT); }

    @Test void hiddenPrivateSiblingsNeitherBlockNorRevealACode() {
        String hall = TestLocations.section(() -> actor("admin", "admin"), Map.of("name", "Code hall " + UUID.randomUUID()));
        String code = code();
        actor("a", "faction_leader").body(Map.of("name", "Shelf A", "code", code, "parentLocationId", hall))
                .post("/api/storage-locations").then().statusCode(200).body("code", equalTo(code));
        actor("b", "faction_leader").body(Map.of("name", "Shelf B", "code", code, "parentLocationId", hall))
                .post("/api/storage-locations").then().statusCode(200).body("code", equalTo(code));
        // The inventory admin sees every sibling, so the code is taken for them.
        actor("admin", "admin").body(Map.of("name", "Public shelf", "code", code, "parentLocationId", hall))
                .post("/api/storage-locations").then().statusCode(409);
    }

    @Test void placingALocationInsideSomeoneElsesBuildingNeedsEditRights() {
        String building = TestLocations.section(() -> actor("owner", "faction_leader"), Map.of("name", "Private building " + UUID.randomUUID()));
        actor("stranger", "faction_leader").body(Map.of("name", "Intruder room", "parentLocationId", building))
                .post("/api/storage-locations").then().statusCode(anyOf(is(403), is(404)));
        actor("owner", "faction_leader").body(Map.of("name", "Own room", "parentLocationId", building))
                .post("/api/storage-locations").then().statusCode(200);
    }
}
