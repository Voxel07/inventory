package org.ash.inventory.platform.api;

/** Normalization shared by command services. */
public final class Inputs {
    private Inputs() {}

    public static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
