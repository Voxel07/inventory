package org.ash.inventory;

import io.restassured.specification.RequestSpecification;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/** Stock is kept in sections and storage places; top-level locations only group them. */
public final class TestLocations {
    private TestLocations() {}

    /** Creates a section with {@code body} inside a fresh top-level location of the same actor and privacy; returns its id. */
    public static String section(Supplier<RequestSpecification> actor, Map<String, ?> body) {
        var site = new HashMap<String, Object>(Map.of("name", "Test site " + UUID.randomUUID()));
        if (body.containsKey("privateResource")) site.put("privateResource", body.get("privateResource"));
        String root = actor.get().body(site).post("/api/storage-locations").then().statusCode(200).extract().path("id");
        var section = new HashMap<String, Object>(body);
        section.put("parentLocationId", root);
        return actor.get().body(section).post("/api/storage-locations").then().statusCode(200).extract().path("id");
    }
}
