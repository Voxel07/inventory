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
        boolean usage = usage(context);
        actors.enterPrivateMutation();
        if (usage) actors.enterUsageCommand();
        try {
            projections.requireEditableReferences(context.getParameters());
            return context.proceed();
        } finally {
            if (usage) actors.exitUsageCommand();
            actors.exitPrivateMutation();
        }
    }

    private static boolean usage(InvocationContext context) {
        var method = context.getMethod();
        if (method == null) return false;
        var annotation = method.getAnnotation(PrivateInventoryCommand.class);
        if (annotation == null) annotation = method.getDeclaringClass().getAnnotation(PrivateInventoryCommand.class);
        return annotation != null && annotation.usage();
    }
}
