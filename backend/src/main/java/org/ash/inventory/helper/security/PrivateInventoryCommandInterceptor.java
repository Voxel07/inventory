package org.ash.inventory.helper.security;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.interceptor.*;
import org.ash.inventory.service.PrivacyProjectionService;

/** Runs inside the transaction interceptor, including offline replay and MCP delegation. */
@PrivateInventoryCommand @Interceptor @Priority(Interceptor.Priority.APPLICATION)
public class PrivateInventoryCommandInterceptor {
    @Inject ActorService actors;
    @Inject PrivacyProjectionService projections;
    @AroundInvoke public Object authorize(InvocationContext context) throws Exception {
        actors.privateMutationDepth++;
        try {
            projections.requireEditableReferences(context.getParameters());
            return context.proceed();
        } finally { actors.privateMutationDepth--; }
    }
}
