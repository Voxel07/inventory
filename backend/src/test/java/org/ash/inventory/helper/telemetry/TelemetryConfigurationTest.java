package org.ash.inventory.helper.telemetry;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TelemetryConfigurationTest {
    @Test void rejectsWrongEndpointShapesWithoutEchoingCredentials() {
        for (String endpoint : new String[]{"http://localhost:5080/api/default/", "http://localhost:5080/api/default/v1/traces",
                "http://secret:password@localhost:5080/api/default", "ftp://localhost/api/default", "not-a-uri"}) {
            var failure = assertThrows(IllegalStateException.class, () -> TelemetryConfiguration.validateEndpoint(endpoint));
            assertFalse(failure.getMessage().contains("secret"));
            assertFalse(failure.getMessage().contains("password"));
        }
        assertDoesNotThrow(() -> TelemetryConfiguration.validateEndpoint("https://observe.example.com/api/default"));
        assertDoesNotThrow(() -> TelemetryConfiguration.validateEndpoint("http://localhost:5080/api/default"));
    }

    @Test void requiresCompleteBasicCredentialsOnlyWhenExportIsEnabled() {
        for (String token : new String[]{"", "not base64", "dXNlcjo=", "OnBhc3M="}) {
            assertThrows(IllegalStateException.class, () -> TelemetryConfiguration.validateToken(token));
        }
        assertDoesNotThrow(() -> TelemetryConfiguration.validateToken("dGVzdDpwYXNzd29yZA=="));
        var configuration = new TelemetryConfiguration();
        configuration.disabled = true;
        assertDoesNotThrow(() -> configuration.validate(null));
    }
}
