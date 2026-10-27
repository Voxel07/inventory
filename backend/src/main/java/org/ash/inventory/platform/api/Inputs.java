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
        return "%" + escapeLike(search.trim().toLowerCase(Locale.ROOT)) + "%";
    }
}
