package com.company.automation.driver;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;

/**
 * Thread-safe holder for per-thread Playwright objects so tests can run in parallel without sharing
 * browser state.
 */
public final class PlaywrightManager {

    private static final ThreadLocal<Playwright> PLAYWRIGHT = new ThreadLocal<>();
    private static final ThreadLocal<Browser> BROWSER = new ThreadLocal<>();
    private static final ThreadLocal<BrowserContext> CONTEXT = new ThreadLocal<>();
    private static final ThreadLocal<Page> PAGE = new ThreadLocal<>();

    private PlaywrightManager() {}

    public static Page getPage() {
        Page page = PAGE.get();
        if (page == null) {
            throw new IllegalStateException(
                    "Page not initialised for this thread. Call PlaywrightFactory.initPage first.");
        }
        return page;
    }

    public static void setPlaywright(Playwright playwright) {
        PLAYWRIGHT.set(playwright);
    }

    public static void setBrowser(Browser browser) {
        BROWSER.set(browser);
    }

    public static void setContext(BrowserContext context) {
        CONTEXT.set(context);
    }

    public static void setPage(Page page) {
        PAGE.set(page);
    }

    public static Playwright getPlaywrightOrNull() {
        return PLAYWRIGHT.get();
    }

    public static Browser getBrowserOrNull() {
        return BROWSER.get();
    }

    public static BrowserContext getContextOrNull() {
        return CONTEXT.get();
    }

    public static Page getPageOrNull() {
        return PAGE.get();
    }

    public static void unload() {
        PLAYWRIGHT.remove();
        BROWSER.remove();
        CONTEXT.remove();
        PAGE.remove();
    }
}
