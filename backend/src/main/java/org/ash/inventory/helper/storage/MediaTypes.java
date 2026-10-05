package org.ash.inventory.helper.storage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;

/** Upload allowlist. The stored type is sniffed from the file's magic bytes, never taken from the client. */
public final class MediaTypes {
    public static final Map<String, String> EXTENSIONS = Map.of(
            "image/webp", ".webp", "image/png", ".png", "image/jpeg", ".jpg", "application/pdf", ".pdf");

    private MediaTypes() {}

    /** The allowlisted type of the content, or {@code null} when it is not an accepted image or PDF. */
    public static String sniff(byte[] head) {
        if (startsWith(head, 0, new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})) return "image/png";
        if (startsWith(head, 0, new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff})) return "image/jpeg";
        if (startsWith(head, 0, ascii("RIFF")) && startsWith(head, 8, ascii("WEBP"))) return "image/webp";
        if (startsWith(head, 0, ascii("%PDF-"))) return "application/pdf";
        return null;
    }

    public static String sniff(Path file) {
        try (InputStream input = Files.newInputStream(file)) {
            return sniff(input.readNBytes(16));
        } catch (IOException exception) {
            return null;
        }
    }

    public static boolean isImage(String contentType) {
        return contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("image/");
    }

    /** The original base name with the extension that matches the sniffed type. */
    public static String fileName(String originalName, String contentType) {
        String name = originalName == null || originalName.isBlank() ? "upload" : originalName;
        int dot = name.lastIndexOf('.');
        if (dot > 0) name = name.substring(0, dot);
        return name + EXTENSIONS.get(contentType);
    }

    /** Content type for a stored key, derived from the extension assigned at upload. */
    public static String fromKey(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        for (var entry : EXTENSIONS.entrySet()) if (lower.endsWith(entry.getValue())) return entry.getKey();
        if (lower.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private static byte[] ascii(String value) { return value.getBytes(StandardCharsets.US_ASCII); }

    private static boolean startsWith(byte[] data, int offset, byte[] prefix) {
        return data != null && data.length >= offset + prefix.length
                && Arrays.equals(data, offset, offset + prefix.length, prefix, 0, prefix.length);
    }
}
