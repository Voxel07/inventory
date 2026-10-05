package org.ash.inventory.helper;

import org.eclipse.microprofile.config.ConfigProvider;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Calendar dates (due dates, availability windows, report dates, document numbers) use one configured
 * business time zone ({@code inventory.timezone}), never the JVM default, so results do not depend on
 * where the server runs.
 */
public final class BusinessTime {
    private static volatile ZoneId zone;

    private BusinessTime() {}

    public static ZoneId zone() {
        ZoneId current = zone;
        if (current == null) {
            current = ConfigProvider.getConfig().getOptionalValue("inventory.timezone", String.class)
                    .map(ZoneId::of).orElse(ZoneId.of("Europe/Berlin"));
            zone = current;
        }
        return current;
    }

    public static LocalDate today() {
        return LocalDate.now(zone());
    }

    public static LocalDate date(Instant instant) {
        return instant.atZone(zone()).toLocalDate();
    }
}
