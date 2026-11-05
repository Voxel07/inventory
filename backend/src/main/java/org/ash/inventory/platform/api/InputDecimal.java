package org.ash.inventory.platform.api;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import java.lang.annotation.*;

/** Non-negative numeric(38,2), including an explicit magnitude bound before scale-changing arithmetic. */
@Documented
@Constraint(validatedBy = {})
@DecimalMin("0")
@DecimalMax("999999999999999999999999999999999999.99")
@Digits(integer = 36, fraction = 2)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
public @interface InputDecimal {
    String message() default "Invalid decimal value";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
