package org.ash.inventory.operations.internal.security;

import io.quarkus.runtime.StartupEvent;
import io.quarkus.runtime.configuration.ConfigUtils;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Refuses to start the {@code prod} profile with header-based development authentication, impersonation or without OIDC. */
@ApplicationScoped
public class ProductionAuthGuard {
    void verify(@Observes StartupEvent ignored,
            @ConfigProperty(name = "inventory.dev-auth.enabled", defaultValue = "false") boolean devAuthEnabled,
            @ConfigProperty(name = "inventory.impersonation.enabled", defaultValue = "false") boolean impersonationEnabled,
            @ConfigProperty(name = "quarkus.oidc.tenant-enabled", defaultValue = "true") boolean oidcEnabled) {
        if (!ConfigUtils.isProfileActive("prod")) return;
        check(devAuthEnabled, impersonationEnabled, oidcEnabled);
    }

    static void check(boolean devAuthEnabled, boolean impersonationEnabled, boolean oidcEnabled) {
        if (devAuthEnabled) throw new IllegalStateException(
                "inventory.dev-auth.enabled (DEV_AUTH_ENABLED) must not be true in the prod profile");
        if (impersonationEnabled) throw new IllegalStateException(
                "inventory.impersonation.enabled (IMPERSONATION_ENABLED) must not be true in the prod profile");
        if (!oidcEnabled) throw new IllegalStateException(
                "OIDC must be enabled (OIDC_ENABLED=true) in the prod profile");
    }
}
