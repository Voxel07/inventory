package org.ash.inventory.operations.internal.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.ash.inventory.platform.api.ApiException;
import java.util.Set;

/** Turns the selected preview into ordered, durable work. All writes still use validated domain commands. */
public final class CsvImportPlan {
    private CsvImportPlan() {}
    public record Prepared(ArrayNode work, ObjectNode result, int rows) {}

    public static Prepared prepare(ObjectNode plan) {
        if (plan.toString().length() > 8_000_000) throw ApiException.badRequest("Import exceeds the 8 MB upload limit");
        String tab = plan.path("tabType").asText();
        if (!Set.of("items", "assemblies", "combined").contains(tab)) throw ApiException.badRequest("Unknown import type");
        var work = JsonNodeFactory.instance.arrayNode();
        var result = JsonNodeFactory.instance.objectNode();
        for (String count : new String[]{"successItems", "updatedItems", "successAssemblies", "successEvents", "successOrders",
                "successGeneralOrders", "successReturns", "successCheckouts", "successOperations"}) result.put(count, 0);
        var errors = result.putArray("errors");
        for (String key : new String[]{"parsedItems", "parsedAssemblies", "parsedEvents", "parsedOrders", "parsedGeneralOrders",
                "parsedReturns", "parsedCheckouts", "parsedOperations", "newFactions"}) {
            if (!plan.path(key).isArray() || plan.path(key).size() > 50_000) throw ApiException.badRequest("Invalid import section: " + key);
            for (var row : plan.path(key)) {
                if (!row.isObject()) throw ApiException.badRequest("Invalid import row");
                if (row.path("status").asText().equals("error"))
                    errors.add(key + " (" + row.path("index").asText() + "): " + row.path("statusMessage").asText());
            }
        }
        for (var row : plan.path("newFactions")) add(work, "faction", row, false);
        if (!tab.equals("assemblies")) {
            for (var row : plan.path("parsedItems")) {
                String status = row.path("status").asText();
                if (status.equals("valid") || status.equals("warning") || status.equals("duplicate") && plan.path("updateExistingItems").asBoolean()) {
                    var data = row.deepCopy();
                    ((ObjectNode)data).put("autoCreateLocations", plan.path("autoCreateLocations").asBoolean());
                    add(work, row.path("isExisting").asBoolean() && !plan.path("updateExistingItems").asBoolean() ? "skip" : "item", data, true);
                }
            }
        }
        if (!tab.equals("items")) valid(work, plan, "parsedAssemblies", "assembly");
        if (tab.equals("combined")) {
            valid(work, plan, "parsedEvents", "event");
            var history = JsonNodeFactory.instance.arrayNode();
            var remaining = JsonNodeFactory.instance.arrayNode();
            boolean workflows = false;
            for (var row : plan.path("parsedOperations")) {
                if (!valid(row)) continue;
                String op = row.path("operation").asText();
                workflows |= !Set.of("stock", "damage", "repair", "repair_transition").contains(op)
                        || (row.path("data").path("occurredAt").asLong() == 0
                        && !(op.equals("stock") && row.path("data").path("transactionType").asText().equals("adjusted")));
                add(workflows ? remaining : history, "operation", row, true);
            }
            work.addAll(history);
            valid(work, plan, "parsedOrders", "order");
            valid(work, plan, "parsedGeneralOrders", "generalOrder");
            for (var row : plan.path("parsedReturns")) if (valid(row) && row.path("targetStatus").asText().equals("accepted")) add(work, "return", row, true);
            valid(work, plan, "parsedCheckouts", "checkout");
            work.addAll(remaining);
            for (var row : plan.path("parsedEvents")) if (valid(row) && row.path("data").path("status").asText().equals("completed")) add(work, "closeEvent", row, false);
        }
        int rows = 0;
        for (var step : work) if (step.path("counted").asBoolean()) rows++;
        if (rows == 0 || work.size() > 100_000) throw ApiException.badRequest("Import must contain between 1 and 100000 entries");
        return new Prepared(work, result, rows);
    }

    private static boolean valid(JsonNode row) { return row.path("status").asText().equals("valid"); }
    private static void valid(ArrayNode work, ObjectNode plan, String section, String kind) {
        for (var row : plan.path(section)) if (valid(row)) add(work, kind, row, true);
    }
    private static void add(ArrayNode work, String kind, JsonNode row, boolean counted) {
        var step = work.addObject().put("kind", kind).put("counted", counted);
        step.set("row", row.deepCopy());
    }
}
