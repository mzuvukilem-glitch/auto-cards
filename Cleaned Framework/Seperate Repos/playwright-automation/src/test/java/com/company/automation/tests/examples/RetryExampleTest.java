package com.company.automation.tests.examples;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.company.automation.base.BaseTest;
import com.company.automation.base.Retry;
import io.qameta.allure.Description;
import org.junit.jupiter.api.Tag;

/**
 * Demonstrates the {@link Retry} mechanism: this test is re-run up to 3 times and reported green if
 * any attempt passes. Use sparingly — retries mask flakiness; prefer fixing the root cause.
 */
@Tag("regression")
class RetryExampleTest extends BaseTest {

    @Retry(3)
    @Description("Re-runs on failure up to 3 attempts")
    void mayBeFlaky() {
        // A real flaky scenario would be timing/environment dependent.
        // Here we simply assert something stable so the example passes.
        assertTrue(page.url() != null, "page should have a URL");
    }
}
