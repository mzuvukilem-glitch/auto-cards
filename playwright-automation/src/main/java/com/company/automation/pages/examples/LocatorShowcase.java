package com.company.automation.pages.examples;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.AriaRole;

import java.util.regex.Pattern;

/**
 * REFERENCE ONLY — a catalogue of every Playwright locator strategy with a
 * one-line explanation and example. Not a real screen.
 *
 * <p>Playwright locators are <b>lazy and auto-waiting</b>: creating a Locator
 * does nothing; the query runs (and waits for actionability) when you act on it.
 *
 * <p>Recommendation order (resilient → brittle):
 * getByRole &gt; getByLabel / getByPlaceholder / getByText / getByTestId &gt;
 * CSS &gt; XPath.
 */
public final class LocatorShowcase {

    private final Page page;

    public LocatorShowcase(Page page) {
        this.page = page;
    }

    // =====================================================================
    // 1) USER-FACING (PREFERRED) — resilient to DOM/markup changes
    // =====================================================================

    /** getByRole — accessibility role + accessible name. The top recommendation. */
    public Locator byRole() {
        return page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Log in"));
    }

    /** getByRole with exact/regex name matching. */
    public Locator byRoleExact() {
        return page.getByRole(AriaRole.LINK,
                new Page.GetByRoleOptions().setName(Pattern.compile("^Checkout$")));
    }

    /** getByText — visible text (substring by default, or exact / regex). */
    public Locator byText() {
        return page.getByText("Welcome back");
    }

    public Locator byTextExact() {
        return page.getByText("Welcome back", new Page.GetByTextOptions().setExact(true));
    }

    /** getByLabel — form control by its associated <label>. Great for inputs. */
    public Locator byLabel() {
        return page.getByLabel("Password");
    }

    /** getByPlaceholder — input by its placeholder text. */
    public Locator byPlaceholder() {
        return page.getByPlaceholder("Username");
    }

    /** getByAltText — images/areas by alt text. */
    public Locator byAltText() {
        return page.getByAltText("Company logo");
    }

    /** getByTitle — element by its title attribute (tooltip). */
    public Locator byTitle() {
        return page.getByTitle("Close dialog");
    }

    /** getByTestId — uses the configured testIdAttribute (data-test here). Stable, explicit. */
    public Locator byTestId() {
        return page.getByTestId("login-button");
    }

    // =====================================================================
    // 2) ENGINE SELECTORS — CSS and XPath
    // =====================================================================

    /** CSS — fast and familiar. Prefer stable ids/attributes over structural paths. */
    public Locator byCss() {
        return page.locator("#login-button");
    }

    public Locator byCssAttribute() {
        return page.locator("input[name='email']");
    }

    /** XPath — supported; use only when CSS/role can't express it (slow, brittle). */
    public Locator byXpath() {
        return page.locator("xpath=//button[normalize-space()='Log in']");
    }

    // =====================================================================
    // 3) FILTERING & CHAINING — narrow a set to the one you want
    // =====================================================================

    /** filter(hasText) — rows/cards containing specific text. */
    public Locator filterByText() {
        return page.getByRole(AriaRole.LISTITEM)
                .filter(new Locator.FilterOptions().setHasText("Sauce Labs Backpack"));
    }

    /** filter(has) — items that contain a child matching another locator. */
    public Locator filterByChild() {
        return page.locator(".cart_item")
                .filter(new Locator.FilterOptions().setHas(page.getByText("Remove")));
    }

    /** Chaining — scope a search inside a parent locator. */
    public Locator chained() {
        return page.locator(".inventory_item").getByRole(AriaRole.BUTTON);
    }

    /** Indexing — first / last / nth within a matched set. */
    public Locator indexed() {
        return page.locator(".inventory_item").nth(2);   // also .first() / .last()
    }

    // =====================================================================
    // 4) FRAMES & SHADOW DOM
    // =====================================================================

    /** frameLocator — reach into an <iframe> before locating. */
    public Locator insideIframe() {
        return page.frameLocator("#payment-frame").getByLabel("Card number");
    }

    // Shadow DOM: Playwright pierces open shadow roots automatically with CSS/role,
    // so page.locator("css=...") finds elements inside open shadow trees with no
    // special syntax.

    /** Expose everything so docs/tests can reference without logic. */
    public Locator[] all() {
        return new Locator[]{
                byRole(), byRoleExact(), byText(), byTextExact(), byLabel(),
                byPlaceholder(), byAltText(), byTitle(), byTestId(),
                byCss(), byCssAttribute(), byXpath(),
                filterByText(), filterByChild(), chained(), indexed(), insideIframe()
        };
    }
}
