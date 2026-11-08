package org.ash.inventory.operations.internal.application;

import org.ash.inventory.platform.api.ApiException;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Item purchase links: validated on input and grouped by shop host into suppliers. */
public final class PurchaseLinks {
    public static final int MAX_LENGTH = 2048;

    private PurchaseLinks() {}

    /** Trimmed absolute http(s) link, or null for a blank value; anything else is rejected. */
    public static String normalize(String value) {
        if (value == null || value.isBlank()) return null;
        var trimmed = value.trim();
        if (trimmed.length() > MAX_LENGTH || host(trimmed) == null)
            throw ApiException.badRequest("Purchase link must be a complete http(s) web address, e.g. https://shop.example/item");
        return trimmed;
    }

    /** Lower-case shop host without a leading {@code www.}, or null when the link is not an absolute http(s) URL. */
    public static String host(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            var uri = new URI(value.trim());
            var scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) return null;
            var host = uri.getHost();
            if (host == null || host.isBlank() || !host.contains(".")) return null;
            host = host.toLowerCase(Locale.ROOT);
            if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
            return host.startsWith("www.") ? host.substring(4) : host;
        } catch (URISyntaxException exception) {
            return null;
        }
    }
}
