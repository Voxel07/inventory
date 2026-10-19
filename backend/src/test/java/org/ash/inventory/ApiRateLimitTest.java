package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.notNullValue;

@QuarkusTest
@TestProfile(ApiRateLimitTest.LowLimit.class)
class ApiRateLimitTest {
    public static class LowLimit implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() {
            // Also overrides the suite-wide %test value.
            return Map.of("inventory.api.rate-limit.requests", "3", "%test.inventory.api.rate-limit.requests", "3",
                    "inventory.api.rate-limit.window-seconds", "60");
        }
    }

    @Test
    void restCallsDrawFromThePerCallerBudget() {
        String caller = "rate-limit-" + UUID.randomUUID();
        for (int i = 0; i < 3; i++) request(caller).get("/api/items").then().statusCode(200);
        request(caller).get("/api/items").then().statusCode(429).header("Retry-After", notNullValue());
        // Budgets are per caller.
        request("rate-limit-other-" + UUID.randomUUID()).get("/api/items").then().statusCode(200);
    }

    @Test
    void nonApiPathsAreNotLimited() {
        for (int i = 0; i < 5; i++) given().get("/q/health/live").then().statusCode(200);
    }

    private static io.restassured.specification.RequestSpecification request(String actor) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", actor).header("X-Actor-Role", "admin");
    }
}
