package org.ash.inventory.operations.internal.security;

import jakarta.enterprise.util.Nonbinding;
import jakarta.interceptor.InterceptorBinding;
import java.lang.annotation.*;

@InterceptorBinding @Retention(RetentionPolicy.RUNTIME) @Target({ElementType.METHOD, ElementType.TYPE})
public @interface PrivateInventoryCommand {
    /**
     * Ordering, takeout, return and request commands: referenced items their owner offered for use
     * only need view rights. Catalog, stock and lifecycle commands keep requiring edit rights.
     */
    @Nonbinding boolean usage() default false;
}
