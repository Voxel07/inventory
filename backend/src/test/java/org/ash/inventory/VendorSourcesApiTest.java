package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.*;

/** Item purchase links and the manual scan that turns them into suppliers with orderable items. */
@QuarkusTest
class VendorSourcesApiTest {
    private RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "vendor-sources-" + name)
                .header("X-Actor-Name", "Vendor sources " + name).header("X-Actor-Role", role);
    }
    private RequestSpecification admin() { return actor("admin", "admin"); }

    private String item(String location, String url, boolean privateResource) {
        var body = new HashMap<String, Object>(Map.of("name", "Linked item " + UUID.randomUUID(), "sku", "LNK-" + UUID.randomUUID(),
                "category", "Links", "storageLocation", location, "amount", 1));
        if (url != null) body.put("purchaseUrl", url);
        if (privateResource) body.put("privateResource", true);
        return admin().body(body).post("/api/items").then().statusCode(200).extract().path("id");
    }

    private static Map<String, Object> group(JsonPath sources, String host) {
        List<Map<String, Object>> groups = sources.getList("vendors");
        return groups.stream().filter(group -> host.equals(group.get("host"))).findFirst().orElse(null);
    }

    @SuppressWarnings("unchecked")
    private static List<String> itemIds(Map<String, Object> group) {
        return ((List<Map<String, Object>>) group.get("items")).stream().map(entry -> (String) entry.get("itemId")).toList();
    }

    @Test void purchaseLinkIsValidatedStoredAndShownOnTheItem() {
        String location = TestLocations.section(this::admin, Map.of("name", "Link shelf " + UUID.randomUUID()));
        String id = item(location, "  https://www.shop.example/p/1  ", false);
        admin().get("/api/items/" + id).then().statusCode(200).body("purchaseUrl", equalTo("https://www.shop.example/p/1"));

        for (var invalid : List.of("shop.example/p/1", "ftp://shop.example/file", "javascript:alert(1)", "https://localhost/x"))
            admin().body(Map.of("name", "Bad link " + UUID.randomUUID(), "category", "Links", "storageLocation", location, "purchaseUrl", invalid))
                    .post("/api/items").then().statusCode(400).body(containsString("Purchase link"));

        // A blank link clears it.
        admin().body(Map.of("name", "Cleared link " + UUID.randomUUID(), "category", "Links", "storageLocation", location, "purchaseUrl", " "))
                .patch("/api/items/" + id).then().statusCode(200).body("purchaseUrl", equalTo(null));
    }

    @Test void scanGroupsLinksByShopReusesSuppliersAndOnlyRunsOnRequest() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String shop = "shop-" + suffix + ".example", known = "known-" + suffix + ".example";
        String location = TestLocations.section(this::admin, Map.of("name", "Link shelf " + suffix));
        String first = item(location, "https://www." + shop + "/cable", false);
        String second = item(location, "https://" + shop.toUpperCase() + "/tape?ref=1", false);
        String third = item(location, "http://" + known + "/lamp", false);
        String privateLocation = TestLocations.section(this::admin, Map.of("name", "Private link shelf " + suffix, "privateResource", true));
        String privateItem = item(privateLocation, "https://private-" + suffix + ".example/x", true);
        String manual = admin().body(Map.of("name", "Known shop " + suffix, "website", "www." + known))
                .post("/api/vendors").then().statusCode(201).extract().path("id");

        var before = admin().get("/api/vendors/sources").then().statusCode(200).extract().jsonPath();
        assertNull(group(before, shop), "links reach suppliers only through a scan");
        assertTrue(before.getLong("changedLinks") >= 3);

        var scanned = admin().post("/api/vendors/sources/scan").then().statusCode(200).extract().jsonPath();
        assertNotNull(scanned.getString("lastScannedAt"));
        assertEquals("Vendor sources admin", scanned.getString("lastScannedBy"));
        assertEquals(0L, scanned.getLong("changedLinks"));
        var generated = group(scanned, shop);
        assertNotNull(generated);
        assertEquals(true, generated.get("generated"));
        assertEquals(shop, generated.get("vendorName"));
        assertEquals(List.of(first, second).stream().sorted().toList(), itemIds(generated).stream().sorted().toList());
        var reused = group(scanned, known);
        assertEquals(manual, reused.get("vendorId"), "a supplier whose website is the shop is reused");
        assertEquals(false, reused.get("generated"));
        assertEquals(List.of(third), itemIds(reused));
        assertNull(group(scanned, "private-" + suffix + ".example"), "privately owned items never create shared suppliers");

        String generatedId = (String) generated.get("vendorId");
        admin().get("/api/vendors?search=" + shop).then().statusCode(200)
                .body("find { it.id == '" + generatedId + "' }.sourceHost", equalTo(shop))
                .body("find { it.id == '" + generatedId + "' }.website", equalTo("https://" + shop));

        // Moving an item to another shop is only reported until the next scan applies it.
        admin().body(Map.of("name", "Moved " + suffix, "category", "Links", "storageLocation", location, "purchaseUrl", "https://" + known + "/cable"))
                .patch("/api/items/" + first).then().statusCode(200);
        var pending = admin().get("/api/vendors/sources").then().statusCode(200).extract().jsonPath();
        assertTrue(pending.getLong("changedLinks") >= 1);
        assertTrue(itemIds(group(pending, shop)).contains(first));

        var rescanned = admin().post("/api/vendors/sources/scan").then().statusCode(200).extract().jsonPath();
        assertEquals(generatedId, group(rescanned, shop).get("vendorId"), "a rescan reuses the generated supplier");
        assertEquals(List.of(second), itemIds(group(rescanned, shop)));
        assertEquals(List.of(first, third).stream().sorted().toList(), itemIds(group(rescanned, known)).stream().sorted().toList());
        assertEquals(0, rescanned.getInt("createdVendors"));
        assertNotNull(privateItem);
    }

    @Test void onlyWarehouseStaffSeeOrScanSupplierLinks() {
        var reader = actor("reader", "read_only");
        reader.get("/api/vendors/sources").then().statusCode(403);
        actor("reader", "read_only").post("/api/vendors/sources/scan").then().statusCode(403);
        actor("crew", "warehouse_crew").post("/api/vendors/sources/scan").then().statusCode(200);
    }
}
