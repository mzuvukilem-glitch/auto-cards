package com.company.automation.pages;

import com.company.automation.config.ConfigReader;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.LoadState;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Base for all Page Objects. Wraps common interactions; Playwright's locators auto-wait, so
 * explicit waits are rarely needed.
 */
public abstract class BasePage {

    protected final Logger log = LogManager.getLogger(getClass());
    protected final Page page;

    /** Path appended to base.url for this page (override in subclasses). */
    protected String path() {
        return "/";
    }

    protected BasePage(Page page) {
        this.page = page;
    }

    /** Navigate to this page's path relative to the configured base URL. */
    public void open() {
        page.navigate(ConfigReader.get("base.url") + path());
        page.waitForLoadState(LoadState.DOMCONTENTLOADED);
    }

    protected void click(Locator locator) {
        log.debug("click {}", locator);
        locator.click();
    }

    protected void type(Locator locator, String text) {
        log.debug("fill '{}' into {}", text, locator);
        locator.fill(text);
    }

    protected String text(Locator locator) {
        String content = locator.textContent();
        return content == null ? "" : content.trim();
    }

    protected boolean isVisible(Locator locator) {
        return locator.isVisible();
    }

    public String title() {
        return page.title();
    }

    public String url() {
        return page.url();
    }
}
