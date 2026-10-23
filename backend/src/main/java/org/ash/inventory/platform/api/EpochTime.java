package org.ash.inventory.platform.api;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

/** The persistence and API date contract: signed epoch milliseconds, calendar dates at midnight UTC. */
public final class EpochTime {
    private EpochTime() {}

    public static long millis(LocalDate date) {
        return date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
    }

    public static LocalDate date(long millis) {
        var instant = Instant.ofEpochMilli(millis);
        var date = instant.atOffset(ZoneOffset.UTC).toLocalDate();
        if (millis(date) != millis) throw new IllegalArgumentException("Calendar dates must be midnight UTC epoch milliseconds");
        return date;
    }
}
