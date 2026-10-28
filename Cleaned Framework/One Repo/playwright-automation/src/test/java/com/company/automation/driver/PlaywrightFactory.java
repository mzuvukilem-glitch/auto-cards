package com.company.automation.driver;

import com.company.automation.config.BrowserType;
import com.company.automation.config.ConfigProvider;
import com.company.automation.config.PlaywrightConfig;
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

        PlaywrightConfig cfg = ConfigProvider.config();
        BrowserType browserType = cfg.browserType();
        boolean headless = cfg.browserOptions().headless();
        double slowMo = cfg.browserOptions().slowmoMs();

        LaunchOptions options = new LaunchOptions().setHeadless(headless).setSlowMo(slowMo);

        // Optional: drive an INSTALLED system browser via its channel (e.g. "chrome",
        // "msedge", "chrome-beta") instead of Playwright's downloaded Chromium. This is the
        // way to run in locked-down/offline environments where the Playwright CDN is blocked.
        // Set -Dbrowser.channel=chrome (only applies to the chromium engine).
        String channel = cfg.browserOptions().channel().trim();
        if (!channel.isEmpty()) {
            options.setChannel(channel);
        }
        log.info("Launching {} (headless={}, channel='{}')", browserType, headless, channel);

        Browser browser =
                switch (browserType) {
                    case CHROMIUM -> playwright.chromium().launch(options);
                    case FIREFOX -> playwright.firefox().launch(options);
                    case WEBKIT -> playwright.webkit().launch(options);
                };
        PlaywrightManager.setBrowser(browser);

        Browser.NewContextOptions contextOptions =
                new Browser.NewContextOptions()
                        .setViewportSize(cfg.viewport().width(), cfg.viewport().height());

        // Video recording requires Playwright's bundled ffmpeg (a CDN download). Keep it OFF by
        // default so the suite runs in offline/locked-down environments; enable with
        // -Drecord.video=true where ffmpeg is available.
        if (cfg.recordVideo()) {
            contextOptions.setRecordVideoDir(Paths.get("videos"));
        }

        // Optional: reuse a saved signed-in session to skip the login UI.
        // Enable with -Dreuse.auth=true once storage-state/auth.json has been saved.
        if (cfg.reuseAuth() && com.company.automation.utils.AuthState.exists()) {
            contextOptions.setStorageStatePath(com.company.automation.utils.AuthState.statePath());
            log.info(
                    "Reusing saved auth state from {}",
                    com.company.automation.utils.AuthState.statePath());
        }

        BrowserContext context = browser.newContext(contextOptions);
        context.setDefaultTimeout(cfg.timeouts().defaultMs());
        context.setDefaultNavigationTimeout(cfg.timeouts().navigationMs());
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
