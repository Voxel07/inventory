package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;

/** Exercise the production transport policy with OIDC disabled and no trusted identity. */
@QuarkusTest
@TestProfile(InventoryMcpAuthenticationTest.AuthenticationRequired.class)
class InventoryMcpAuthenticationTest {
    public static class AuthenticationRequired implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("inventory.dev-auth.enabled", "false",
                    "quarkus.http.auth.permission.mcp.paths", "/mcp,/mcp/*",
                    "quarkus.http.auth.permission.mcp.policy", "authenticated");
        }
    }

    @Test
    void anonymousRootAndSseRequestsCannotInitializeReadOrTerminateSessions() {
        for (String path : new String[]{"/mcp", "/mcp/sse", "/mcp/messages"}) {
            given().header("Accept", "application/json, text/event-stream").get(path).then().statusCode(401);
            given().header("Accept", "application/json, text/event-stream").contentType("application/json")
                    .body(Map.of("jsonrpc", "2.0", "id", 1, "method", "initialize", "params", Map.of()))
                    .post(path).then().statusCode(401);
            given().delete(path).then().statusCode(401);
        }
    }

    @Test
    void developmentActorHeadersCannotBypassTransportAuthentication() {
        given().header("X-Actor-Id", "spoofed-admin").header("X-Actor-Role", "hq_admin")
                .header("Accept", "application/json, text/event-stream").contentType("application/json")
                .body(Map.of("jsonrpc", "2.0", "id", 1, "method", "tools/list", "params", Map.of()))
                .post("/mcp").then().statusCode(401);
    }
}
