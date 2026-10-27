package com.company.automation.base;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.junit.jupiter.api.TestTemplate;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * Marks a test to retry on failure up to {@code value} attempts. JUnit 5 has no built-in retry, so
 * this pairs a {@link TestTemplate} with {@link RetryExtension} which stops re-running once an
 * attempt passes.
 *
 * <pre>
 * {@literal @}Retry(3)
 * void flakyTest() { ... }
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@TestTemplate
@ExtendWith(RetryExtension.class)
public @interface Retry {
    /** Maximum attempts (including the first). */
    int value() default 2;
}
