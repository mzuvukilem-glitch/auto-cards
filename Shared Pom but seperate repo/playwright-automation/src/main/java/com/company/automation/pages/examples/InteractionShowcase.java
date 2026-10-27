package com.company.automation.pages.examples;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.assertions.PlaywrightAssertions;
import com.microsoft.playwright.options.AriaRole;
import com.microsoft.playwright.options.LoadState;
import com.microsoft.playwright.options.MouseButton;
import java.nio.file.Paths;
import java.util.List;
import java.util.regex.Pattern;

/**
 * REFERENCE ONLY — a catalogue of common Playwright UI interactions with heavy comments. Not a real
 * screen.
 *
 * <p>Playwright actions <b>auto-wait</b> for the element to be actionable (attached, visible,
 * stable, enabled), so explicit sleeps are almost never needed. Assertions via {@link
 * PlaywrightAssertions} are <b>web-first</b>: they retry until the condition holds or the timeout
 * expires.
 */
public final class InteractionShowcase {

    private final Page page;

    public InteractionShowcase(Page page) {
        this.page = page;
    }

    // Reused example locators.
    private Locator field() {
        return page.getByLabel("Username");
    }

    private Locator button() {
        return page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Log in"));
    }

    // =====================================================================
    // NAVIGATION
    // =====================================================================

    public void navigation() {
        page.navigate("https://www.saucedemo.com"); // go to a URL
        page.reload(); // reload
        page.goBack(); // browser back
        page.goForward(); // browser forward
        page.waitForLoadState(LoadState.NETWORKIDLE); // wait for network to settle
    }

    // =====================================================================
    // BASIC INPUT
    // =====================================================================

    public void click() {
        button().click(); // standard click (auto-waits)
    }

    public void clickVariants() {
        button().dblclick(); // double click
        button().click(new Locator.ClickOptions().setButton(MouseButton.RIGHT)); // right click
        button().click(new Locator.ClickOptions().setClickCount(2)); // multi click
        button().click(
                        new Locator.ClickOptions()
                                .setForce(true)); // bypass actionability (use sparingly)
    }

    public void typeAndFill() {
        field().fill("standard_user"); // fast set value (preferred)
        field().clear(); // clear
        field().pressSequentially(
                        "s-l-o-w",
                        new Locator.PressSequentiallyOptions().setDelay(100)); // key-by-key
    }

    public void keyboard() {
        field().press("Enter"); // single key
        field().press("Control+A"); // chord
        page.keyboard().type("typed at page level"); // page-level keyboard
    }

    // =====================================================================
    // FORM CONTROLS
    // =====================================================================

    public void checkboxesAndRadios() {
        Locator terms = page.getByLabel("I agree");
        terms.check(); // check (no-op if already checked)
        terms.uncheck(); // uncheck
        boolean checked = terms.isChecked(); // state
        assert checked || !checked; // (reference only)
    }

    public void selectDropdown() {
        Locator country = page.getByLabel("Country");
        country.selectOption("ZA"); // by value
        country.selectOption(new String[] {"ZA", "US"}); // multi-select
    }

    public void fileUpload() {
        page.getByLabel("Upload")
                .setInputFiles(Paths.get("src/test/resources/testdata/sample.txt"));
        page.getByLabel("Upload")
                .setInputFiles(new java.nio.file.Path[] {}); // empty array clears the selection
    }

    // =====================================================================
    // READING STATE
    // =====================================================================

    public void reading() {
        String text = button().textContent(); // text
        String value = field().inputValue(); // input value
        String attr = button().getAttribute("id"); // attribute
        boolean visible = button().isVisible(); // visibility
        boolean enabled = button().isEnabled(); // enabled
        int count = page.locator(".inventory_item").count(); // how many match
        List<String> all = page.locator(".inventory_item .title").allTextContents(); // all texts
        // (reference only — values intentionally unused)
        assert text != null
                || value != null
                || attr != null
                || visible
                || enabled
                || count >= 0
                || all != null;
    }

    // =====================================================================
    // MOUSE / POINTER
    // =====================================================================

    public void hoverAndMouse() {
        page.getByText("Menu").hover(); // hover to reveal a submenu
        page.mouse().move(100, 200); // move
        page.mouse().down(); // press
        page.mouse().move(300, 400); // drag path
        page.mouse().up(); // release
    }

    public void dragAndDrop() {
        // High-level drag: source onto target (auto-waits both).
        page.getByTestId("item-1").dragTo(page.getByTestId("dropzone"));
    }

    // =====================================================================
    // WAITING (rarely needed — prefer web-first assertions)
    // =====================================================================

    public void waiting() {
        button().waitFor(); // wait until visible (default)
        page.waitForURL("**/inventory.html"); // wait for navigation
        page.waitForSelector("#inventory_container"); // wait for a selector (legacy-ish)
    }

    // =====================================================================
    // WEB-FIRST ASSERTIONS (auto-retrying) — the idiomatic way to verify
    // =====================================================================

    public void assertions() {
        PlaywrightAssertions.assertThat(button()).isVisible();
        PlaywrightAssertions.assertThat(button()).isEnabled();
        PlaywrightAssertions.assertThat(field()).hasValue("standard_user");
        PlaywrightAssertions.assertThat(page.getByText("Products")).hasText("Products");
        PlaywrightAssertions.assertThat(page).hasURL(Pattern.compile(".*inventory.*"));
        PlaywrightAssertions.assertThat(page).hasTitle("Swag Labs");
    }

    // =====================================================================
    // DIALOGS, TABS, NETWORK
    // =====================================================================

    public void dialogs() {
        // Register a handler BEFORE the action that triggers the dialog.
        page.onDialog(
                dialog -> {
                    System.out.println("Dialog: " + dialog.message());
                    dialog.accept(); // or dialog.dismiss()
                });
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Delete")).click();
    }

    public void newTab() {
        // Capture a popup/new tab opened by a click.
        Page popup =
                page.waitForPopup(
                        () ->
                                page.getByRole(
                                                AriaRole.LINK,
                                                new Page.GetByRoleOptions().setName("Open docs"))
                                        .click());
        popup.waitForLoadState();
        popup.close();
    }

    public void network() {
        // Wait for a specific response while triggering it.
        page.waitForResponse("**/api/cart", () -> page.getByTestId("add-to-cart").click());
    }

    // =====================================================================
    // SCREENSHOTS / SCROLL
    // =====================================================================

    public void screenshotsAndScroll() {
        page.screenshot(
                new Page.ScreenshotOptions()
                        .setPath(Paths.get("screenshots/page.png"))
                        .setFullPage(true)); // full-page shot
        button().screenshot(
                        new Locator.ScreenshotOptions()
                                .setPath(Paths.get("screenshots/button.png"))); // element shot
        button().scrollIntoViewIfNeeded(); // scroll element into view
    }
}
