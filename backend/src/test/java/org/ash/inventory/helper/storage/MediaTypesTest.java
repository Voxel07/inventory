package org.ash.inventory.helper.storage;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class MediaTypesTest {
    @Test
    void sniffsOnlyAllowlistedTypesFromMagicBytes() {
        assertEquals("image/png", MediaTypes.sniff(new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0}));
        assertEquals("image/jpeg", MediaTypes.sniff(new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0}));
        assertEquals("image/webp", MediaTypes.sniff("RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.US_ASCII)));
        assertEquals("application/pdf", MediaTypes.sniff("%PDF-1.7".getBytes(StandardCharsets.US_ASCII)));
        assertNull(MediaTypes.sniff("<svg xmlns=".getBytes(StandardCharsets.US_ASCII)));
        assertNull(MediaTypes.sniff("<html>".getBytes(StandardCharsets.US_ASCII)));
        assertNull(MediaTypes.sniff(new byte[]{1, 2, 3}));
    }

    @Test
    void storedNamesCarryTheSniffedExtension() {
        assertEquals("photo.webp", MediaTypes.fileName("photo.html", "image/webp"));
        assertEquals("upload.pdf", MediaTypes.fileName(null, "application/pdf"));
        assertEquals("application/pdf", MediaTypes.fromKey("vendor-documents/x/upload.pdf"));
        assertEquals("application/octet-stream", MediaTypes.fromKey("legacy.gif"));
    }
}
