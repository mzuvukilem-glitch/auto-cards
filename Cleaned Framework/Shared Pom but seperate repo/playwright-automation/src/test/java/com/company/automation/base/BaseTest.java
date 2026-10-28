package com.company.automation.base;

import com.company.automation.config.ConfigReader;
import com.company.automation.driver.PlaywrightFactory;
import com.company.automation.pages.LoginPage;
import com.company.automation.utils.AllureEnvironmentWriter;
import com.microsoft.playwright.Page;
import org.apache.logging.log4j.ThreadContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.TestInfo;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * Lifecycle base for all tests. Creates a fresh Playwright page per test (thread-safe) and tears it
 * down afterwards. Registers the failure-screenshot extension.
 */
@ExtendWith(ScreenshotOnFailure.class)
public abstract class BaseTest {

    protected Page page;

    @BeforeAll
    static void beforeAll() {
        // Populate the Allure Environment widget once (idempotent across classes).
        AllureEnvironmentWriter.write();
    }

    @BeforeEach
    void setUp(TestInfo testInfo) {
        // Correlation id for this thread's test — appears in logs as [%X{testId}].
        ThreadContext.put(
                "testId",
                testInfo.getTestMethod().map(java.lang.reflect.Method::getName).orElse("test")
                        + "-"
                        + Thread.currentThread().getId());
        page = PlaywrightFactory.initPage();
    }

    @AfterEach
    void tearDown() {
        PlaywrightFactory.closePage();
        ThreadContext.remove("testId");
    }

    /** Convenience: open the app at the login screen. */
    protected LoginPage openLogin() {
        LoginPage login = new LoginPage(page);
        page.navigate(ConfigReader.get("base.url") + "/");
        return login;
    }
}
