package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;
import java.util.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class OrderPickupApiTest {
    private RequestSpecification actor(String subject, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", subject).header("X-Actor-Name", subject).header("X-Actor-Role", role).header("X-Actor-Factions", "");
    }
    private RequestSpecification admin() { return actor("pickup-admin", "admin"); }
    private String user(String subject) { return actor(subject, "faction_leader").get("/api/auth/me").then().statusCode(200).extract().path("id"); }
    private String location(String name) {
        return TestLocations.section(() -> admin(), Map.of("name", name + " " + UUID.randomUUID()));
    }
    private String item(String name, String category, String location) {
        return admin().body(Map.of("name", name, "sku", "PICKUP-" + UUID.randomUUID(), "category", category, "amount", 10, "minStock", 0, "value", 0, "storageLocation", location))
                .post("/api/items").then().statusCode(200).extract().path("id");
    }
    private void responsible(String item, String person) {
        admin().body(Map.of("responsiblePersonId", person)).patch("/api/items/" + item + "/responsibility").then().statusCode(200).body("responsiblePersonId", equalTo(person));
    }
    private String faction(Map<String, Integer> items, Map<String, Integer> assemblies) {
        return admin().body(Map.of("eventType", "DE", "faction", "Pickup " + UUID.randomUUID(), "eventDate", "2041-06-12", "requestedQuantities", items, "requestedAssemblyQuantities", assemblies))
                .post("/api/orders/faction").then().statusCode(200).extract().path("id");
    }
    private Map<String, Object> assignment(String person, String name, String location) {
        var result = new LinkedHashMap<String, Object>(); result.put("responsiblePersonId", person); result.put("groupName", name); result.put("pickupLocationId", location); return result;
    }

    @Test void factionGroupsRouteOnlyAssignedItemsAndSupportSeparatePickupPoints() {
        String suffix = UUID.randomUUID().toString(), aliceSubject = "lighting-" + suffix, bobSubject = "furniture-" + suffix;
        String alice = user(aliceSubject), bob = user(bobSubject), tech = location("Lighting pickup"), general = location("Event pickup");
        String light = item("Lighting", "Lighting", tech), table = item("Tables", "Furniture", general), chair = item("Chairs", "Furniture", general);
        responsible(light, alice); responsible(table, bob); responsible(chair, bob);
        admin().get("/api/items/" + light + "/responsibility").then().statusCode(200).body("responsiblePersonName", equalTo(aliceSubject));
        String order = faction(Map.of(light, 2, table, 3, chair, 4), Map.of()), path = "/api/orders/faction/" + order + "/pickup-groups";
        admin().get(path).then().statusCode(200).body("groups.size()", equalTo(2));
        admin().body(Map.of("assignments", Map.of(light, assignment(alice, "Lighting", tech), table, assignment(bob, "General event equipment", general), chair, assignment(bob, "General event equipment", general))))
                .patch(path).then().statusCode(200).body("groups.size()", equalTo(2)).body("groups.pickupLocationId", containsInAnyOrder(tech, general));
        UUID key = UUID.randomUUID();
        admin().body(Map.of("idempotencyKey", key)).post("/api/orders/faction/" + order + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("idempotencyKey", key)).post("/api/orders/faction/" + order + "/transitions/submitted").then().statusCode(200);
        actor(aliceSubject, "faction_leader").get("/api/notifications").then().statusCode(200)
                .body("findAll { it.type == 'order_items_assigned' }.size()", equalTo(1))
                .body("[0].payload.groupCount", equalTo(1)).body("[0].payload.groups", nullValue())
                .body("[0].payload.path", containsString("pickupOrder=" + order));
        // Changes after submission only show on the order page.
        admin().body(Map.of("assignments", Map.of(light, assignment(alice, "Lighting rig", tech), table, assignment(bob, "General event equipment", general), chair, assignment(bob, "General event equipment", general))))
                .patch(path).then().statusCode(200);
        actor(aliceSubject, "faction_leader").get("/api/notifications").then().statusCode(200).body("size()", equalTo(1));
        // Organization members read every order's plan; only the creator's side and warehouse change it.
        actor(bobSubject, "faction_leader").get(path).then().statusCode(200).body("canEdit", equalTo(false))
                .body("groups.size()", equalTo(2));
        actor("unassigned-" + suffix, "read_only").get(path).then().statusCode(200).body("canEdit", equalTo(false));
        actor("tenant-" + suffix, "tenant").get(path).then().statusCode(403);
        actor(bobSubject, "faction_leader").body(Map.of("assignments", Map.of())).patch(path).then().statusCode(403);
        admin().post(path + "/notify").then().statusCode(200).body(equalTo("2"));
        actor(bobSubject, "faction_leader").get("/api/notifications").then().statusCode(200).body("size()", equalTo(2));
        admin().body(Map.of("preparedQuantities", Map.of(light, 2, table, 3, chair, 4))).post("/api/orders/faction/" + order + "/prepare").then().statusCode(200);
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post("/api/orders/faction/" + order + "/transitions/ready").then().statusCode(200);
        admin().get(path).then().statusCode(200).body("pickupPointsComplete", equalTo(true)).body("groups.pickupLocationId", containsInAnyOrder(tech, general));
    }

    @Test void assemblyComponentsAreCountedAndNotifiedWithoutDuplicatingDirectItems() {
        String subject = "assembly-keeper-" + UUID.randomUUID(), keeper = user(subject), shelf = location("Kit pickup");
        String generator = item("Generator", "Lighting", shelf), cable = item("Cable", "Lighting", shelf);
        responsible(generator, keeper); responsible(cable, keeper);
        String assembly = admin().body(Map.of("name", "Lighting kit", "itemQuantities", Map.of(generator, 1, cable, 2)))
                .post("/api/assemblies").then().statusCode(200).extract().path("id");
        String order = faction(Map.of(cable, 1), Map.of(assembly, 2)), path = "/api/orders/faction/" + order;
        admin().body(Map.of()).post(path + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(generator, 2, cable, 5))).post(path + "/prepare").then().statusCode(200);
        // Reopening preparation re-enters "submitted" without a second notice.
        admin().body(Map.of()).post(path + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(generator, 2, cable, 5))).post(path + "/prepare").then().statusCode(200);
        actor(subject, "faction_leader").get("/api/notifications").then().statusCode(200)
                .body("findAll { it.type == 'order_items_assigned' }.size()", equalTo(1));
        admin().get(path + "/pickup-groups").then().statusCode(200)
                .body("groups.size()", equalTo(1)).body("groups[0].items.size()", equalTo(2))
                .body("groups[0].items.find { it.itemId == '" + cable + "' }.ordered", equalTo(5))
                .body("groups[0].items.find { it.itemId == '" + cable + "' }.prepared", equalTo(5));
        admin().body(Map.of("pickupLocation", shelf, "pickupLatitude", 52.5, "pickupLongitude", 13.4)).post(path + "/transitions/ready").then().statusCode(200);
        actor(subject, "faction_leader").get("/api/notifications").then().statusCode(200)
                .body("findAll { it.type == 'order_group_ready' }.size()", equalTo(1));
        admin().get(path + "/pickup-groups").then().statusCode(200).body("groups[0].pickupLocationId", equalTo(shelf));
    }

    @Test void mixedPrivatePickupLocationsDoNotBlockTheRecipientsPublicGroups() {
        String subject = "public-keeper-" + UUID.randomUUID(), keeper = user(subject), publicPoint = location("Public pickup");
        String light = item("Public light", "Lighting", publicPoint), table = item("Public table", "Furniture", publicPoint);
        String privatePoint = TestLocations.section(() -> admin(), Map.of("name", "Private pickup", "privateResource", true));
        String order = faction(Map.of(light, 1, table, 1), Map.of()), path = "/api/orders/faction/" + order + "/pickup-groups";
        admin().body(Map.of("assignments", Map.of(light, assignment(keeper, "Lighting", publicPoint), table, assignment(null, "Furniture", privatePoint))))
                .patch(path).then().statusCode(200);
        // The keeper reads the whole plan, but the private pickup point stays hidden.
        actor(subject, "faction_leader").get(path).then().statusCode(200).body("groups.size()", equalTo(2))
                .body("groups.pickupLocationId", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem(privatePoint)))
                .body("groups.find { it.responsiblePersonId == '" + keeper + "' }.items.itemId", contains(light))
                .body("groups.find { it.responsiblePersonId == '" + keeper + "' }.pickupLocationId", equalTo(publicPoint));
        admin().post(path + "/notify").then().statusCode(200).body(equalTo("1"));
        actor(subject, "faction_leader").get("/api/notifications").then().statusCode(200).body("size()", equalTo(1)).body("[0].payload.pickupLocation", nullValue());
    }

    @Test void generalOrdersSupportSplittingOnePersonsItemsAndRejectInvalidChangesAtomically() {
        String subject = "general-keeper-" + UUID.randomUUID(), keeper = user(subject), first = location("Lighting"), second = location("Furniture");
        String light = item("Light", "Event equipment", first), table = item("Table", "Event equipment", second), outside = item("Other", "Other", first);
        responsible(light, keeper); responsible(table, keeper);
        String event = admin().body(Map.of("name", "Pickup event", "eventType", "DE", "startDate", "2042-06-01", "endDate", "2042-06-02"))
                .post("/api/events").then().statusCode(200).extract().path("id");
        String order = admin().body(Map.of("name", "General pickup", "purpose", "Event setup", "eventOccurrenceId", event, "requestedQuantities", Map.of(light, 2, table, 1)))
                .post("/api/orders/general").then().statusCode(200).extract().path("id"), path = "/api/orders/general/" + order;
        var assignments = Map.of(light, assignment(keeper, "Lighting", first), table, assignment(keeper, "Tables and chairs", second));
        admin().body(Map.of("assignments", assignments)).patch(path + "/pickup-groups").then().statusCode(200).body("groups.size()", equalTo(2));
        admin().body(Map.of("assignments", Map.of(outside, assignment(keeper, "Other", first)))).patch(path + "/pickup-groups").then().statusCode(400);
        admin().body(Map.of("assignments", Map.of(light, assignment(UUID.randomUUID().toString(), "Lighting", first)))).patch(path + "/pickup-groups").then().statusCode(404);
        admin().body(Map.of("assignments", Map.of(light, assignment(keeper, "Lighting", UUID.randomUUID().toString())))).patch(path + "/pickup-groups").then().statusCode(404);
        admin().get(path + "/pickup-groups").then().statusCode(200).body("groups.size()", equalTo(2));
        actor("pickup-reader", "read_only").body(Map.of("assignments", assignments)).patch(path + "/pickup-groups").then().statusCode(403);
        actor("pickup-reader", "read_only").post(path + "/pickup-groups/notify").then().statusCode(403);
        actor("pickup-reader", "read_only").body(Map.of("responsiblePersonId", keeper)).patch("/api/items/" + light + "/responsibility").then().statusCode(403);
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post(path + "/transitions/submitted").then().statusCode(200);
        actor(subject, "faction_leader").get("/api/notifications").then().statusCode(200).body("size()", equalTo(1)).body("[0].payload.groupCount", equalTo(2));
        admin().post(path + "/pickup-groups/notify").then().statusCode(200).body(equalTo("1"));
        admin().body(Map.of("preparedQuantities", Map.of(light, 2, table, 1), "idempotencyKey", UUID.randomUUID())).post(path + "/prepare").then().statusCode(200);
        admin().body(Map.of("idempotencyKey", UUID.randomUUID())).post(path + "/transitions/ready").then().statusCode(200);
        actor(subject, "faction_leader").get(path + "/pickup-groups").then().statusCode(200).body("groups.items.flatten().prepared", containsInAnyOrder(2, 1));
        actor(subject, "faction_leader").get("/api/notifications").then().statusCode(200).body("findAll { it.type == 'order_group_ready' }.size()", equalTo(1));
        admin().get("/api/notifications").then().statusCode(200).body("find { it.type == 'order_ready' && it.payload.path.contains('" + order + "') }.payload.path", containsString("pickupKind=general"));
        admin().body(Collections.singletonMap("responsiblePersonId", null)).patch("/api/items/" + light + "/responsibility").then().statusCode(200).body("responsiblePersonId", nullValue());
    }
}
