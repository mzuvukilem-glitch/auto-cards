package com.company.automation.base;

import com.company.automation.config.ConfigReader;
import com.company.automation.driver.PlaywrightFactory;
import com.company.automation.pages.LoginPage;
import com.microsoft.playwright.Page;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * Lifecycle base for all tests. Creates a fresh Playwright page per test
 * (thread-safe) and tears it down afterwards. Registers the failure-screenshot
 * extension.
 */
@ExtendWith(ScreenshotOnFailure.class)
public abstract class BaseTest {

    protected Page page;

    @BeforeEach
    void setUp() {
        page = PlaywrightFactory.initPage();
    }

    @AfterEach
    void tearDown() {
        PlaywrightFactory.closePage();
    }

    /** Convenience: open the app at the login screen. */
    protected LoginPage openLogin() {
        LoginPage login = new LoginPage(page);
        page.navigate(ConfigReader.get("base.url") + "/");
        return login;
    }
}
