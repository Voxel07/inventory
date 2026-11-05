package org.ash.inventory.platform.api;

import jakarta.validation.Constraint;
import jakarta.validation.OverridesAttribute;
import jakarta.validation.Payload;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.lang.annotation.*;

/** Bounded plain text. Preserve markup as text; PostgreSQL cannot store NUL characters. */
@Documented
@Constraint(validatedBy = {})
@Size(max = 255)
@Pattern(regexp = "[^\\x00]*", message = "must not contain NUL characters")
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
public @interface InputText {
    String message() default "Invalid text";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    @OverridesAttribute(constraint = Size.class, name = "max")
    int max() default 255;
}
