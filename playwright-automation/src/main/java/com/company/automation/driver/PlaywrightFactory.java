package com.company.automation.driver;

import com.company.automation.config.BrowserType;
import com.company.automation.config.ConfigReader;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType.LaunchOptions;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;

import java.nio.file.Paths;

/**
 * Creates and tears down Playwright objects, one set per thread, so JUnit 5
 * parallel execution is safe. Everything is held in {@link PlaywrightManager}
 * ThreadLocals.
 */
public final class PlaywrightFactory {

    private PlaywrightFactory() {
    }

    /** Launches a browser, context and page for the current thread. */
    public static Page initPage() {
        Playwright playwright = Playwright.create();
        PlaywrightManager.setPlaywright(playwright);

        BrowserType browserType = BrowserType.from(ConfigReader.get("browser", "chromium"));
        boolean headless = ConfigReader.getBoolean("headless", true);
        double slowMo = ConfigReader.getInt("slowmo.ms", 0);

        LaunchOptions options = new LaunchOptions()
                .setHeadless(headless)
                .setSlowMo(slowMo);

        Browser browser = switch (browserType) {
            case CHROMIUM -> playwright.chromium().launch(options);
            case FIREFOX -> playwright.firefox().launch(options);
            case WEBKIT -> playwright.webkit().launch(options);
        };
        PlaywrightManager.setBrowser(browser);

        BrowserContext context = browser.newContext(new Browser.NewContextOptions()
                .setViewportSize(
                        ConfigReader.getInt("viewport.width", 1280),
                        ConfigReader.getInt("viewport.height", 720))
                .setRecordVideoDir(Paths.get("videos")));
        context.setDefaultTimeout(ConfigReader.getInt("default.timeout", 15000));
        context.setDefaultNavigationTimeout(ConfigReader.getInt("navigation.timeout", 30000));
        PlaywrightManager.setContext(context);

        Page page = context.newPage();
        PlaywrightManager.setPage(page);
        return page;
    }

    /** Closes the current thread's Playwright objects and clears the ThreadLocals. */
    public static void closePage() {
        BrowserContext context = PlaywrightManager.getContextOrNull();
        if (context != null) {
            context.close();
        }
        Browser browser = PlaywrightManager.getBrowserOrNull();
        if (browser != null) {
            browser.close();
        }
        Playwright playwright = PlaywrightManager.getPlaywrightOrNull();
        if (playwright != null) {
            playwright.close();
        }
        PlaywrightManager.unload();
    }
}
