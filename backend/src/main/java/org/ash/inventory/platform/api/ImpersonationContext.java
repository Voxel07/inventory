package org.ash.inventory.platform.api;

import io.quarkus.arc.Arc;
import jakarta.enterprise.context.RequestScoped;

import java.util.UUID;

/** The signed-in administrator while a request acts as another account; audit records keep both. */
@RequestScoped
public class ImpersonationContext {
    private UUID impersonator;

    public void impersonatedBy(UUID administrator) { impersonator = administrator; }

    /** A method, not the field: the injected bean is a client proxy whose own fields are never set. */
    public UUID impersonator() { return impersonator; }

    /** Null outside impersonated requests, including scheduled jobs without a request context. */
    public static UUID current() {
        var container = Arc.container();
        if (container == null || !container.requestContext().isActive()) return null;
        return container.instance(ImpersonationContext.class).get().impersonator();
    }
}
