package org.ash.inventory.notification.api;

import org.junit.jupiter.api.Test;

import java.net.InetAddress;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Users choose webhook targets; the operator chooses the ntfy server. Neither may reach internal hosts unintended. */
class OutboundEndpointTest {
    @Test void onlyPublicInternetAddressesArePublic() throws Exception {
        for (var internal : new String[] {"127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254",
                "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1"})
            assertFalse(PersonalWebhookPublisher.isPublic(InetAddress.getByName(internal)), internal);
        for (var external : new String[] {"1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"})
            assertTrue(PersonalWebhookPublisher.isPublic(InetAddress.getByName(external)), external);
    }

    @Test void webhooksNeedHttpsWithoutCredentialsToAPublicHost() {
        assertThrows(IllegalArgumentException.class, () -> PersonalWebhookPublisher.validate("http://1.1.1.1/hook"));
        assertThrows(IllegalArgumentException.class, () -> PersonalWebhookPublisher.validate("https://user:secret@1.1.1.1/hook"));
        assertThrows(IllegalArgumentException.class, () -> PersonalWebhookPublisher.validate("https://127.0.0.1/hook"));
        assertThrows(IllegalArgumentException.class, () -> PersonalWebhookPublisher.validate("https://[::1]/hook"));
        assertThrows(IllegalArgumentException.class, () -> PersonalWebhookPublisher.validate("not a url"));
        assertEquals("https://1.1.1.1/hook", PersonalWebhookPublisher.validate(" https://1.1.1.1/hook "));
    }

    @Test void ntfyCredentialsTravelInPlainHttpOnlyToInternalHosts() throws Exception {
        assertEquals("https://1.1.1.1", NtfyPublisher.internal("https://1.1.1.1").toString());
        assertEquals("http://127.0.0.1:8080", NtfyPublisher.internal("http://127.0.0.1:8080").toString());
        assertEquals("http://10.0.0.5", NtfyPublisher.internal("http://10.0.0.5").toString());
        assertThrows(IllegalArgumentException.class, () -> NtfyPublisher.internal("http://1.1.1.1"));
        assertThrows(IllegalArgumentException.class, () -> NtfyPublisher.internal("ftp://10.0.0.5"));
    }
}
