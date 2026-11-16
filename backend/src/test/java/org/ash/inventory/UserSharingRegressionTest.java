package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;
import java.util.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/** User management and sharing groups: deactivated people, hidden groups, transfers, history and directory filters. */
@QuarkusTest
class UserSharingRegressionTest {
    private final String s = UUID.randomUUID().toString().substring(0, 8);
    private RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "sharing-" + name + "-" + s)
                .header("X-Actor-Name", "sharing-" + name + "-" + s).header("X-Actor-Role", role);
    }
    private RequestSpecification admin() { return actor("admin", "admin"); }
    private RequestSpecification owner() { return actor("owner", "faction_leader"); }
    private String person(String name, String role) {
        actor(name, role).get("/api/access/people").then().statusCode(200);
        return admin().get("/api/access/people").then().statusCode(200).extract().jsonPath()
                .getString("find { it.name == 'sharing-" + name + "-" + s + "' }.id");
    }
    private void deactivate(String id) {
        int revision = admin().get("/api/users/" + id + "/lifecycle").then().statusCode(200).extract().path("revision");
        admin().body(Map.of("active", false, "revision", revision, "reason", "Left the club")).patch("/api/users/" + id + "/lifecycle").then().statusCode(204);
    }
    private String item() {
        return owner().body(Map.of("sku", "SHR-" + UUID.randomUUID(), "name", "Shared " + UUID.randomUUID(), "category", "Sharing-" + s,
                "amount", 1, "minStock", 0, "value", 0)).post("/api/items").then().statusCode(200).extract().path("id");
    }
    private Map<String, Object> group(String name, List<String> members, int revision) {
        return Map.of("name", name, "revision", revision, "memberIds", members, "reason", "Sharing test");
    }

    @Test void deactivatedMembersStayOnGroupSaveButCannotBeAdded() {
        person("owner", "faction_leader");
        String kept = person("kept", "read_only"), late = person("late", "read_only");
        String id = owner().body(group("Crew " + s, List.of(kept), 0)).post("/api/access/groups").then().statusCode(200).extract().path("id");
        deactivate(kept); deactivate(late);
        owner().get("/api/access/groups").then().statusCode(200)
                .body("find { it.id == '" + id + "' }.members.find { it.id == '" + kept + "' }.active", equalTo(false));
        owner().body(group("Crew renamed " + s, List.of(kept), 1)).patch("/api/access/groups/" + id).then().statusCode(200)
                .body("memberIds", hasItem(kept));
        owner().body(group("Crew renamed " + s, List.of(kept, late), 2)).patch("/api/access/groups/" + id).then().statusCode(400);
        owner().body(group("Crew renamed " + s, List.of(), 2)).patch("/api/access/groups/" + id).then().statusCode(200).body("memberIds", empty());
    }

    @Test void deactivatedSharesAndHiddenGroupsStayOnSharingSave() {
        person("owner", "faction_leader"); String sharee = person("sharee", "read_only"), late = person("late", "read_only");
        String hidden = actor("stranger", "tenant").body(group("Stranger group " + s, List.of(), 0))
                .post("/api/access/groups").then().statusCode(200).extract().path("id");
        String item = item();
        admin().body(Map.of("revision", 0, "grants", List.of(Map.of("userId", sharee, "canEdit", false), Map.of("groupId", hidden, "canEdit", false))))
                .put("/api/access/items/" + item).then().statusCode(200);
        deactivate(sharee); deactivate(late);
        var view = owner().get("/api/access/items/" + item).then().statusCode(200).extract().jsonPath();
        owner().body(Map.of("revision", view.getInt("revision"), "grants", view.getList("grants"), "publicUse", true))
                .put("/api/access/items/" + item).then().statusCode(200).body("grants.size()", equalTo(2)).body("publicUse", equalTo(true));
        // New shares still need an active person and a group the manager may use.
        var grants = new ArrayList<Object>(List.of(Map.of("userId", late, "canEdit", false)));
        owner().body(Map.of("revision", view.getInt("revision") + 1, "grants", grants)).put("/api/access/items/" + item).then().statusCode(400);
        String other = owner().body(Map.of("sku", "SHR-" + UUID.randomUUID(), "name", "Other " + s, "category", "Sharing-" + s, "amount", 1, "minStock", 0, "value", 0))
                .post("/api/items").then().statusCode(200).extract().path("id");
        owner().body(Map.of("revision", 0, "grants", List.of(Map.of("groupId", hidden, "canEdit", false)))).put("/api/access/items/" + other).then().statusCode(400);
    }

    @Test void ownershipTransferKeepsInactiveShares() {
        String from = person("owner", "faction_leader"), to = person("heir", "faction_leader"), sharee = person("gone", "read_only");
        String item = item();
        owner().body(Map.of("revision", 0, "grants", List.of(Map.of("userId", sharee, "canEdit", false)))).put("/api/access/items/" + item).then().statusCode(200);
        deactivate(sharee);
        String policy = admin().get("/api/users/" + from + "/lifecycle").then().statusCode(200).extract().jsonPath()
                .getString("resources.find { it.id == '" + item + "' }.policyId");
        admin().body(Map.of("successorId", to, "policyIds", List.of(policy), "reason", "Offboarding")).post("/api/users/" + from + "/lifecycle/transfer")
                .then().statusCode(200).body("transferred", hasItem(policy)).body("blocked", anEmptyMap());
        admin().get("/api/access/items/" + item).then().statusCode(200).body("ownerId", equalTo(to)).body("grants.userId", hasItem(sharee));
    }

    @Test void groupTransferNameClashIsReportedPerGroup() {
        String from = person("leaver", "faction_leader"), to = person("successor", "faction_leader");
        String clashing = actor("leaver", "faction_leader").body(group("Hall " + s, List.of(), 0)).post("/api/access/groups").then().statusCode(200).extract().path("id");
        String free = actor("leaver", "faction_leader").body(group("Yard " + s, List.of(), 0)).post("/api/access/groups").then().statusCode(200).extract().path("id");
        actor("successor", "faction_leader").body(group("hall " + s, List.of(), 0)).post("/api/access/groups").then().statusCode(200);
        admin().body(Map.of("successorId", to, "policyIds", List.of(clashing, free), "reason", "Offboarding")).post("/api/users/" + from + "/lifecycle/transfer")
                .then().statusCode(200).body("transferred", contains(free)).body("blocked." + clashing, containsString("already owns a group"));
    }

    @Test void lifecycleChangesAppearInAccessHistoryWithState() {
        String member = person("history", "read_only");
        deactivate(member);
        admin().get("/api/users/" + member + "/history").then().statusCode(200)
                .body("[0].before.active", equalTo(true)).body("[0].after.active", equalTo(false))
                .body("[0].after.roles", hasItem("read_only")).body("[0].reason", equalTo("Left the club"));
    }

    @Test void directoryFiltersByActiveState() {
        String gone = person("filtered", "read_only");
        deactivate(gone);
        String search = "sharing-filtered-" + s;
        admin().queryParam("search", search).queryParam("active", false).get("/api/users").then().statusCode(200).body("id", hasItem(gone));
        admin().queryParam("search", search).queryParam("active", true).get("/api/users").then().statusCode(200).body("id", not(hasItem(gone)));
    }

    @Test void groupTypeIsFixedAndReadOnlyOwnersKeepManagingTheirGroup() {
        String reader = person("downgraded", "faction_leader");
        var downgraded = actor("downgraded", "faction_leader");
        String id = downgraded.body(group("Mine " + s, List.of(), 0)).post("/api/access/groups").then().statusCode(200).extract().path("id");
        var change = new HashMap<String, Object>(group("Mine " + s, List.of(), 1)); change.put("adminManaged", true);
        admin().body(change).patch("/api/access/groups/" + id).then().statusCode(400);
        int revision = admin().get("/api/users/" + reader + "/lifecycle").then().statusCode(200).extract().path("revision");
        admin().body(Map.of("roles", List.of("read_only"), "factions", List.of(), "revision", revision, "reason", "Downgrade")).patch("/api/users/" + reader).then().statusCode(200);
        actor("downgraded", "read_only").body(group("Mine renamed " + s, List.of(), 1)).patch("/api/access/groups/" + id).then().statusCode(200);
        actor("downgraded", "read_only").body(group("New " + s, List.of(), 0)).post("/api/access/groups").then().statusCode(403);
    }
}
