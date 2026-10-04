package org.ash.inventory.helper;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.interceptor.*;
import jakarta.transaction.TransactionSynchronizationRegistry;
/** Set isolation just inside JTA, before the first query establishes a snapshot. */
@ConsistentRead @Interceptor @Priority(Interceptor.Priority.PLATFORM_BEFORE + 210)
public class ConsistentReadInterceptor {
    private static final Object KEY = new Object();
    @Inject org.ash.inventory.orm.ConsistentReadOrm reads;
    @Inject TransactionSynchronizationRegistry transactions;
    @AroundInvoke
    Object snapshot(InvocationContext context) throws Exception {
        if (transactions.getResource(KEY) == null) {
            reads.beginSnapshot();
            transactions.putResource(KEY, true);
        }
        return context.proceed();
    }
}
