package org.ash.inventory;

import io.restassured.specification.RequestSpecification;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

/** A lot only comes into being with the stock booking that brings its first units in (no empty lots). */
public final class TestLots {
    private TestLots() {}

    /** Receives {@code quantity} units into a new lot at {@code location}; returns the new lot's id. */
    public static String receive(Supplier<RequestSpecification> actor, String item, int quantity, String location,
            String lotNumber, Long expiryDate, String status) {
        var lot = new HashMap<String, Object>(Map.of("lotNumber", lotNumber));
        if (expiryDate != null) lot.put("expiryDate", expiryDate);
        if (status != null) lot.put("status", status);
        var body = new HashMap<String, Object>(Map.of("itemId", item, "transactionType", "added",
                "quantityChanged", quantity, "reason", "Lot receipt", "newLot", lot));
        if (location != null) body.put("locationId", location);
        actor.get().body(body).post("/api/transactions").then().statusCode(200);
        String id = actor.get().queryParam("itemId", item).queryParam("size", 200).get("/api/inventory-lots")
                .then().statusCode(200).extract().path("find { it.lotNumber == '" + lotNumber + "' }.id");
        if (id == null) throw new AssertionError("Lot " + lotNumber + " was not created for item " + item);
        return id;
    }
}
