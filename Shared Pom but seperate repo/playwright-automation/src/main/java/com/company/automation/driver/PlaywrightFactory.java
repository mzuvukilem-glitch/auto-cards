package com.company.automation.driver;

import com.company.automation.config.BrowserType;
import com.company.automation.config.ConfigReader;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType.LaunchOptions;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import java.nio.file.Paths;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Creates and tears down Playwright objects, one set per thread, so JUnit 5 parallel execution is
 * safe. Everything is held in {@link PlaywrightManager} ThreadLocals.
 */
public final class PlaywrightFactory {

    private static final Logger log = LogManager.getLogger(PlaywrightFactory.class);

    private PlaywrightFactory() {}

    /** Launches a browser, context and page for the current thread. */
    public static Page initPage() {
        Playwright playwright = Playwright.create();
        PlaywrightManager.setPlaywright(playwright);

        BrowserType browserType = BrowserType.from(ConfigReader.get("browser", "chromium"));
        boolean headless = ConfigReader.getBoolean("headless", true);
        log.info("Launching {} (headless={})", browserType, headless);
        double slowMo = ConfigReader.getInt("slowmo.ms", 0);

        LaunchOptions options = new LaunchOptions().setHeadless(headless).setSlowMo(slowMo);

        Browser browser =
                switch (browserType) {
                    case CHROMIUM -> playwright.chromium().launch(options);
                    case FIREFOX -> playwright.firefox().launch(options);
                    case WEBKIT -> playwright.webkit().launch(options);
                };
        PlaywrightManager.setBrowser(browser);

        Browser.NewContextOptions contextOptions =
                new Browser.NewContextOptions()
                        .setViewportSize(
                                ConfigReader.getInt("viewport.width", 1280),
                                ConfigReader.getInt("viewport.height", 720))
                        .setRecordVideoDir(Paths.get("videos"));

        // Optional: reuse a saved signed-in session to skip the login UI.
        // Enable with -Dreuse.auth=true once storage-state/auth.json has been saved.
        if (ConfigReader.getBoolean("reuse.auth", false)
                && com.company.automation.utils.AuthState.exists()) {
            contextOptions.setStorageStatePath(com.company.automation.utils.AuthState.statePath());
            log.info(
                    "Reusing saved auth state from {}",
                    com.company.automation.utils.AuthState.statePath());
        }

        BrowserContext context = browser.newContext(contextOptions);
        context.setDefaultTimeout(ConfigReader.getInt("default.timeout", 15000));
        context.setDefaultNavigationTimeout(ConfigReader.getInt("navigation.timeout", 30000));
        PlaywrightManager.setContext(context);

        Page page = context.newPage();
        PlaywrightManager.setPage(page);
        log.info("Browser session ready");
        return page;
    }

    /** Closes the current thread's Playwright objects and clears the ThreadLocals. */
    public static void closePage() {
        log.info("Closing browser session");
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
