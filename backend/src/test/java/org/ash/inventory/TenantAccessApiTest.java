package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/** Tenants only see and manage their own (or shared) private inventory, never organization data. */
@QuarkusTest
class TenantAccessApiTest {
    private RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "tenant-test-" + name)
                .header("X-Actor-Name", "tenant-test-" + name).header("X-Actor-Role", role);
    }
    private RequestSpecification tenant() { return actor("tenant", "tenant"); }
    private RequestSpecification admin() { return actor("admin", "admin"); }

    private String publicItem() {
        return admin().body(Map.of("sku", "TENANT-PUB-" + UUID.randomUUID(), "name", "Company tent " + UUID.randomUUID(), "category", "Tents",
                        "amount", 1, "value", 0, "privateResource", false))
                .post("/api/items").then().statusCode(200).extract().path("id");
    }

    @Test void tenantsOnlySeeTheirOwnPrivateInventory() {
        String company = publicItem();
        String building = TestLocations.section(() -> tenant(), Map.of("name", "Rented hall " + UUID.randomUUID()));
        tenant().get("/api/storage-locations/" + building).then().statusCode(200).body("access.privateResource", equalTo(true));
        String own = tenant().body(Map.of("sku", "TENANT-OWN-" + UUID.randomUUID(), "name", "Own generator", "category", "Power",
                        "amount", 1, "value", 0, "storageLocation", building))
                .post("/api/items").then().statusCode(200).body("access.privateResource", equalTo(true)).extract().path("id");

        tenant().get("/api/items").then().statusCode(200).body("id", hasItem(own)).body("id", not(hasItem(company)));
        tenant().get("/api/items/" + company).then().statusCode(404);
        tenant().get("/api/storage-locations").then().statusCode(200).body("access.privateResource", everyItem(equalTo(true)));
        tenant().get("/api/assemblies").then().statusCode(200).body("access.privateResource", everyItem(equalTo(true)));
        tenant().get("/api/transactions?itemId=" + own).then().statusCode(200);
        tenant().get("/api/auth/me").then().statusCode(200).body("role", equalTo("tenant"));

        actor("reader", "read_only").get("/api/items/" + company).then().statusCode(200);
        actor("reader", "read_only").get("/api/items/" + own).then().statusCode(404);
    }

    @Test void tenantsCannotReachOrganizationApis() {
        for (String path : List.of("/api/orders/faction", "/api/orders/general", "/api/events", "/api/factions",
                "/api/transactions", "/api/custody-balances", "/api/member/custody", "/api/sync/audit", "/api/users",
                "/api/reports", "/api/purchase-orders"))
            tenant().get(path).then().statusCode(403);
        tenant().get("/api/action-inbox").then().statusCode(200).body("size()", equalTo(0));
    }

    @Test void tenantsCannotAttachOrganizationResources() {
        String company = publicItem();
        String shelf = TestLocations.section(() -> admin(), Map.of("name", "Company shelf " + UUID.randomUUID(), "privateResource", false));
        tenant().body(Map.of("sku", "TENANT-ATTACH-" + UUID.randomUUID(), "name", "Sneaky", "category", "Power",
                "amount", 0, "value", 0, "storageLocation", shelf)).post("/api/items").then().statusCode(404);
        tenant().body(Map.of("name", "Sneaky kit", "itemQuantities", Map.of(company, 1))).post("/api/assemblies")
                .then().statusCode(anyOf(is(400), is(404)));
        tenant().body(Map.of("name", "Sub of company shelf", "parentLocationId", shelf)).post("/api/storage-locations")
                .then().statusCode(anyOf(is(400), is(404)));
    }

    @Test void tenantsManageTheirOwnShareGroups() {
        String group = tenant().body(Map.of("name", "Hall guests " + UUID.randomUUID(), "revision", 0, "memberIds", List.of(), "reason", "Building access"))
                .post("/api/access/groups").then().statusCode(200).body("canManage", equalTo(true)).extract().path("id");
        tenant().get("/api/access/groups").then().statusCode(200).body("id", hasItem(group));
        actor("other-tenant", "tenant").get("/api/access/groups").then().statusCode(200).body("id", not(hasItem(group)));
        admin().get("/api/access/groups").then().statusCode(200).body("id", hasItem(group));
    }
}
