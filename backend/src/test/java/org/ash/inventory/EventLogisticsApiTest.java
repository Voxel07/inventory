package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/** Event attendees with a shared people registry and predefined roles, plus the two-tab event timeline. */
@QuarkusTest
class EventLogisticsApiTest {
    private RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "logistics-" + name)
                .header("X-Actor-Name", "Logistics " + name).header("X-Actor-Role", role);
    }
    /** Event planning belongs to the inventory admin. */
    private RequestSpecification planner() { return actor("planner", "admin"); }
    private RequestSpecification tenant() { return actor("tenant", "tenant"); }
    private RequestSpecification warehouse() { return actor("warehouse", "warehouse_crew"); }
    private RequestSpecification reader() { return actor("reader", "read_only"); }

    private String event(String eventType) {
        return planner().body(Map.of("eventType", eventType, "name", "Logistics " + UUID.randomUUID(),
                        "startDate", "2039-05-01", "endDate", "2039-05-03", "status", "planned"))
                .post("/api/events").then().statusCode(200).extract().path("id");
    }
    private String faction(String eventType) {
        return planner().body(Map.of("eventType", eventType, "name", "Faction " + UUID.randomUUID()))
                .post("/api/factions").then().statusCode(200).extract().path("id");
    }
    private static Map<String, Object> role(String role, String factionId, String assignment) {
        var value = new HashMap<String, Object>();
        value.put("role", role);
        value.put("factionId", factionId);
        value.put("assignment", assignment);
        return value;
    }
    private static Map<String, Object> attendee(String personId, String name, List<Map<String, Object>> roles) {
        var value = new HashMap<String, Object>();
        value.put("personId", personId);
        value.put("personName", name);
        value.put("arrivesAt", "2039-05-01T08:00:00");
        value.put("leavesAt", "2039-05-03T18:00:00");
        value.put("foodStampsIssued", false);
        value.put("roles", roles);
        return value;
    }

    @Test void peopleAreSharedAcrossEventsAndRenamesApplyEverywhere() {
        String faction = faction("DE"), first = event("DE"), second = event("DE");
        String name = "Erika " + UUID.randomUUID();
        String person = planner().body(attendee(null, name, List.of(role("faction_leader", faction, null), role("as_held", null, null))))
                .post("/api/events/" + first + "/attendees").then().statusCode(200)
                .body("person.name", equalTo(name)).body("person.userId", nullValue())
                .body("roles.role", contains("faction_leader", "as_held"))
                .body("roles[0].factionId", equalTo(faction)).body("roles[0].factionName", startsWith("Faction "))
                .body("mainMealStamps", equalTo(4)).body("breakfastStamps", equalTo(1))
                .extract().path("person.id");

        String renamed = name + " Mustermann";
        planner().body(attendee(person, renamed, List.of(role("event_crew", null, "  Kitchen  "), role("faction_hq_crew", faction, null))))
                .post("/api/events/" + second + "/attendees").then().statusCode(200)
                .body("person.id", equalTo(person)).body("roles[0].assignment", equalTo("Kitchen"));

        warehouse().get("/api/events/" + first + "/attendees").then().statusCode(200)
                .body("find { it.person.id == '" + person + "' }.person.name", equalTo(renamed));
        warehouse().get("/api/event-people").then().statusCode(200)
                .body("find { it.id == '" + person + "' }.attendances", equalTo(2));

        planner().body(attendee(person, renamed, List.of(role("as_held", null, null))))
                .post("/api/events/" + first + "/attendees").then().statusCode(409);
    }

    @Test void rolesArePredefinedAndFactionRolesNeedAFactionOfTheEventType() {
        String own = faction("DE"), foreign = faction("ASD"), event = event("DE");
        String path = "/api/events/" + event + "/attendees";
        planner().body(attendee(null, "No faction", List.of(role("faction_deputy", null, null)))).post(path).then().statusCode(400);
        planner().body(attendee(null, "Wrong type", List.of(role("faction_deputy", foreign, null)))).post(path).then().statusCode(400);
        planner().body(attendee(null, "Faction on AS-Held", List.of(role("as_held", own, null)))).post(path).then().statusCode(400);
        planner().body(attendee(null, "Assigned leader", List.of(role("faction_leader", own, "Kitchen")))).post(path).then().statusCode(400);
        planner().body(attendee(null, "Twice", List.of(role("faction_leader", own, null), role("faction_leader", own, null)))).post(path).then().statusCode(400);
        planner().body(attendee(null, "Free text role", List.of(role("Kitchen", null, null)))).post(path).then().statusCode(400);
        planner().body(attendee(null, "No role", List.of())).post(path).then().statusCode(400);
        var reversed = attendee(null, "Reversed travel", List.of(role("event_crew", null, null)));
        reversed.put("leavesAt", "2039-04-30T08:00:00");
        planner().body(reversed).post(path).then().statusCode(400);
        warehouse().get(path).then().statusCode(200).body("size()", equalTo(0));
    }

    @Test void readsAreForOrganizationMembersWritesAreAdminOnlyAndScopedToTheEvent() {
        String event = event("DE"), other = event("DE");
        String path = "/api/events/" + event + "/attendees";
        var crew = attendee(null, "Crew " + UUID.randomUUID(), List.of(role("event_crew", null, "Setup")));
        reader().get(path).then().statusCode(200);
        reader().get("/api/event-people").then().statusCode(200);
        reader().body(crew).post(path).then().statusCode(403);
        tenant().get(path).then().statusCode(403);
        warehouse().body(crew).post(path).then().statusCode(403);
        warehouse().get("/api/event-people/accounts").then().statusCode(403);
        String attendee = planner().body(crew).post(path).then().statusCode(200).extract().path("id");
        planner().body(crew).put("/api/events/" + other + "/attendees/" + attendee).then().statusCode(404);
        planner().delete("/api/events/" + other + "/attendees/" + attendee).then().statusCode(404);
        planner().delete(path + "/" + attendee).then().statusCode(204);
        warehouse().get(path).then().statusCode(200).body("size()", equalTo(0));
    }

    @Test void aPersonCanOptionallyBeLinkedToOneAccount() {
        warehouse().get("/api/event-people").then().statusCode(200);
        String account = planner().get("/api/event-people/accounts").then().statusCode(200)
                .extract().path("find { it.name == 'Logistics warehouse' }.id");
        String event = event("DE");
        var linked = attendee(null, "Linked " + UUID.randomUUID(), List.of(role("as_held", null, null)));
        linked.put("personUserId", account);
        String person = planner().body(linked).post("/api/events/" + event + "/attendees").then().statusCode(200)
                .body("person.userId", equalTo(account)).body("person.userName", equalTo("Logistics warehouse"))
                .extract().path("person.id");
        planner().get("/api/event-people/accounts").then().statusCode(200)
                .body("find { it.id == '" + account + "' }.linkedPersonId", equalTo(person));

        var second = attendee(null, "Second " + UUID.randomUUID(), List.of(role("as_held", null, null)));
        second.put("personUserId", account);
        planner().body(second).post("/api/events/" + event("DE") + "/attendees").then().statusCode(409);
    }

    @Test void timelineKeepsBothSchedulesAndGoesWithTheEvent() {
        String event = event("DE");
        String path = "/api/events/" + event + "/timeline";
        planner().body(Map.of("category", "preparation", "title", "Build checkpoint", "startsAt", "2039-04-29T10:00:00",
                "endsAt", "2039-04-30T18:00:00", "status", "planned")).post(path).then().statusCode(200);
        String action = planner().body(Map.of("category", "in_game", "title", "Mission briefing", "startsAt", "2039-05-01T09:00:00",
                "status", "planned")).post(path).then().statusCode(200).extract().path("id");
        planner().body(Map.of("category", "in_game", "title", "Mission briefing", "startsAt", "2039-05-01T09:00:00",
                "status", "completed", "location", "HQ tent")).put(path + "/" + action).then().statusCode(200)
                .body("status", equalTo("completed")).body("location", equalTo("HQ tent"));
        planner().body(Map.of("category", "teardown", "title", "Unknown tab", "startsAt", "2039-05-03T09:00:00",
                "status", "planned")).post(path).then().statusCode(400);
        planner().body(Map.of("category", "in_game", "title", "Backwards", "startsAt", "2039-05-03T09:00:00",
                "endsAt", "2039-05-03T08:00:00", "status", "planned")).post(path).then().statusCode(400);
        warehouse().get(path).then().statusCode(200)
                .body("category", contains("preparation", "in_game")).body("title", contains("Build checkpoint", "Mission briefing"));
        warehouse().body(Map.of("category", "in_game", "title", "Denied", "startsAt", "2039-05-01T09:00:00", "status", "planned"))
                .post(path).then().statusCode(403);

        String name = "Kept " + UUID.randomUUID();
        String person = planner().body(attendee(null, name, List.of(role("event_crew", null, null))))
                .post("/api/events/" + event + "/attendees").then().statusCode(200).extract().path("person.id");
        actor("admin", "admin").delete("/api/events/" + event).then().statusCode(204);
        warehouse().get(path).then().statusCode(404);
        warehouse().get("/api/event-people").then().statusCode(200)
                .body("find { it.id == '" + person + "' }.attendances", equalTo(0));
    }
}
