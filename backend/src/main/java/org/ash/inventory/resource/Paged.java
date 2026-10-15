package org.ash.inventory.resource;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a list endpoint that honours {@code page}/{@code size}. Only these responses carry {@code X-Has-More};
 * an unpaged list must never advertise a continuation, or exhaustive readers would request it forever.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Paged {}
