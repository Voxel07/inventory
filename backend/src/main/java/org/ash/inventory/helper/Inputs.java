package org.ash.inventory.helper;

/** Normalization shared by command services. */
public final class Inputs {
    private Inputs() {}

    public static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
