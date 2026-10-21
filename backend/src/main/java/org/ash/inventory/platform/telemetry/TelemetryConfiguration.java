package org.ash.inventory.platform.telemetry;

import io.opentelemetry.api.common.Attributes;

import io.opentelemetry.sdk.resources.Resource;

import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;

import jakarta.enterprise.event.Observes;

import jakarta.enterprise.inject.Produces;

import jakarta.inject.Singleton;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import org.jboss.logging.Logger;

import java.net.URI;

import java.nio.charset.StandardCharsets;

import java.util.Base64;

import java.util.UUID;

@ApplicationScoped

public class TelemetryConfiguration {

    private static final Logger LOG = Logger.getLogger(TelemetryConfiguration.class);

    @ConfigProperty(name = "quarkus.otel.sdk.disabled") boolean disabled;

    @ConfigProperty(name = "quarkus.otel.exporter.otlp.endpoint") String endpoint;

    @ConfigProperty(name = "inventory.telemetry.token", defaultValue = "") java.util.Optional<String> token;

    @ConfigProperty(name = "inventory.telemetry.environment") String environment;

    @ConfigProperty(name = "inventory.telemetry.version") String version;

    @ConfigProperty(name = "inventory.telemetry.instance-id", defaultValue = "") java.util.Optional<String> configuredInstance;

    private final String generatedInstance = UUID.randomUUID().toString();

    @Produces @Singleton

    Resource resource() {

        return Resource.create(Attributes.builder().put("service.namespace", "ash")

                .put("service.instance.id", configuredInstance.filter(value -> !value.isBlank()).orElse(generatedInstance))

                .put("service.version", version).put("deployment.environment.name", environment).build());

    }

    void validate(@Observes StartupEvent ignored) {

        if (disabled) { LOG.info("OpenObserve export disabled; application debug logs remain available on stdout"); return; }

        validateEndpoint(endpoint);

        validateToken(token.orElse(""));

        LOG.infof("OpenObserve export enabled: traces, metrics and logs; environment=%s version=%s instance=%s",

                environment, version, configuredInstance.filter(value -> !value.isBlank()).orElse(generatedInstance));

    }

    static void validateEndpoint(String value) {

        try {

            var uri = URI.create(value);

            if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null

                    || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null

                    || uri.getPath().endsWith("/") || !uri.getPath().matches(".*/api/[^/]+")) {

                throw new IllegalArgumentException();

            }

        } catch (IllegalArgumentException exception) {

            throw new IllegalStateException("OTEL_EXPORTER_OTLP_ENDPOINT must be an HTTP(S) organization base URL ending in /api/<organization>, without a trailing slash");

        }

    }

    static void validateToken(String value) {

        try {

            var decoded = new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);

            int colon = decoded.indexOf(':');

            if (colon <= 0 || colon == decoded.length() - 1) throw new IllegalArgumentException();

        } catch (IllegalArgumentException exception) {

            throw new IllegalStateException("OTEL_EXPORTER_OTLP_TOKEN must contain the base64 ingestion credentials when export is enabled");

        }

    }

}

