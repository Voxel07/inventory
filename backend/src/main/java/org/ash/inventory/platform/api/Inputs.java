package org.ash.inventory.platform.api;

import java.util.Locale;

/** Normalization shared by command services. */
public final class Inputs {
    private Inputs() {}

    public static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** {@code value} with {@code !}, {@code %} and {@code _} matching literally in {@code like :p escape '!'}. */
    public static String escapeLike(String value) {
        return value.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    /** Lower-case {@code %term%} pattern for a user search, matched with {@code like :search escape '!'}. */
    public static String containsPattern(String search) {
        if (search.length() > 255 || search.indexOf('\0') >= 0) throw ApiException.badRequest("Search text is invalid or too long");
        return "%" + escapeLike(search.trim().toLowerCase(Locale.ROOT)) + "%";
    }

    public static int addQuantity(int current, int added) {
        try { return Math.addExact(current, added); }
        catch (ArithmeticException invalid) { throw ApiException.badRequest("Quantity exceeds the supported range"); }
    }

    /** JSON envelopes are persisted as JSONB before their individual commands run. Validate their contents too. */
    public static void validateJson(com.fasterxml.jackson.databind.JsonNode root) {
        var pending = new java.util.ArrayDeque<com.fasterxml.jackson.databind.JsonNode>();
        pending.add(root);
        int count = 0;
        while (!pending.isEmpty()) {
            var node = pending.removeLast();
            if (++count > 500_000) throw ApiException.badRequest("JSON input contains too many values");
            if (node.isTextual() && (node.textValue().length() > 16_000 || node.textValue().indexOf('\0') >= 0))
                throw ApiException.badRequest("JSON text is invalid or too long");
            if (node.isNumber() && (!Double.isFinite(node.doubleValue()) || node.isIntegralNumber() && !node.canConvertToLong()))
                throw ApiException.badRequest("JSON number exceeds the supported range");
            if (node.isObject()) node.properties().forEach(entry -> {
                if (entry.getKey().length() > 255 || entry.getKey().indexOf('\0') >= 0)
                    throw ApiException.badRequest("JSON property name is invalid or too long");
                pending.add(entry.getValue());
            });
            else if (node.isArray()) node.forEach(pending::add);
        }
    }
}
