package com.company.automation.base;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestExecutionExceptionHandler;
import org.junit.jupiter.api.extension.TestTemplateInvocationContext;
import org.junit.jupiter.api.extension.TestTemplateInvocationContextProvider;

/**
 * Drives {@link Retry}: provides up to N invocations and, via an exception handler, swallows
 * failures on all but the final attempt — so a test that passes on any attempt is reported green,
 * and one that never passes fails on its last attempt.
 */
public class RetryExtension
        implements TestTemplateInvocationContextProvider, TestExecutionExceptionHandler {

    private int maxAttempts = 1;
    private int attempt = 0;
    private boolean passed = false;

    @Override
    public boolean supportsTestTemplate(ExtensionContext context) {
        return context.getTestMethod().map(m -> m.isAnnotationPresent(Retry.class)).orElse(false);
    }

    @Override
    public Stream<TestTemplateInvocationContext> provideTestTemplateInvocationContexts(
            ExtensionContext context) {
        maxAttempts =
                Math.max(1, context.getRequiredTestMethod().getAnnotation(Retry.class).value());
        List<TestTemplateInvocationContext> invocations = new ArrayList<>();
        for (int i = 1; i <= maxAttempts; i++) {
            invocations.add(invocation(i));
        }
        // Lazily stop once a prior attempt passed.
        return invocations.stream().takeWhile(c -> !passed);
    }

    @Override
    public void handleTestExecutionException(ExtensionContext context, Throwable throwable)
            throws Throwable {
        // Rethrow on the last attempt (real failure); swallow earlier ones (retry).
        if (attempt >= maxAttempts) {
            throw throwable;
        }
        // swallowed — this attempt is marked passed/aborted but the template continues
    }

    private TestTemplateInvocationContext invocation(int index) {
        return new TestTemplateInvocationContext() {
            @Override
            public String getDisplayName(int invocationIndex) {
                return "attempt " + index + "/" + maxAttempts;
            }

            @Override
            public List<org.junit.jupiter.api.extension.Extension> getAdditionalExtensions() {
                return List.of(
                        (org.junit.jupiter.api.extension.BeforeEachCallback) ctx -> attempt = index,
                        (org.junit.jupiter.api.extension.AfterTestExecutionCallback)
                                ctx -> {
                                    if (ctx.getExecutionException().isEmpty()) {
                                        passed = true;
                                    }
                                });
            }
        };
    }
}
