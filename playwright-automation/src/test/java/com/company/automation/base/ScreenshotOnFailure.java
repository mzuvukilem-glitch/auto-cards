package com.company.automation.base;

import com.company.automation.driver.PlaywrightManager;
import com.company.automation.utils.ScreenshotUtils;
import com.microsoft.playwright.Page;
import io.qameta.allure.Allure;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestWatcher;

import java.io.ByteArrayInputStream;

/**
 * JUnit 5 extension that attaches a screenshot to the Allure report when a test
 * fails. The page must still be open (teardown runs after this watcher).
 */
public class ScreenshotOnFailure implements TestWatcher {

    @Override
    public void testFailed(ExtensionContext context, Throwable cause) {
        Page page = PlaywrightManager.getPageOrNull();
        if (page == null) {
            return;
        }
        try {
            byte[] screenshot = ScreenshotUtils.capture(page);
            Allure.addAttachment(
                    "Failure - " + context.getDisplayName(),
                    new ByteArrayInputStream(screenshot));
        } catch (Exception e) {
            System.out.println("Could not capture failure screenshot: " + e.getMessage());
        }
    }
}
