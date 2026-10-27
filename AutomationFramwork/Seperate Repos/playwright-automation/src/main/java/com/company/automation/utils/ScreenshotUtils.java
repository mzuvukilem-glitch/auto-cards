package com.company.automation.utils;

import com.microsoft.playwright.Page;

/** Captures screenshots as bytes for attaching to the Allure report. */
public final class ScreenshotUtils {

    private ScreenshotUtils() {}

    public static byte[] capture(Page page) {
        return page.screenshot(new Page.ScreenshotOptions().setFullPage(true));
    }
}
