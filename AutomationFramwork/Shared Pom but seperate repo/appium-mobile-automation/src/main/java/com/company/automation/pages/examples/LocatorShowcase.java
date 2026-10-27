package com.company.automation.pages.examples;

import com.company.automation.driver.DriverManager;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.AppiumDriver;
import org.openqa.selenium.By;

/**
 * REFERENCE ONLY — a catalogue of every Appium locator strategy with a one-line explanation and
 * example. This class is not a real screen; it exists to document how to find elements on Android
 * and iOS.
 *
 * <p>Two ways to locate elements:
 *
 * <ul>
 *   <li><b>Selenium {@link By}</b> — cross-platform strategies (id, xpath, css*, className, name,
 *       tagName, linkText). *css applies to web/hybrid contexts.
 *   <li><b>Appium {@link AppiumBy}</b> — mobile-specific strategies (accessibilityId,
 *       androidUIAutomator, iOSNsPredicate, iOSClassChain, androidDataMatcher/viewMatcher for
 *       Espresso, image, and the By aliases).
 * </ul>
 *
 * <p>Rule of thumb for stability: accessibilityId &gt; id &gt; purpose-built platform selectors
 * (UiAutomator / NsPredicate / ClassChain) &gt; xpath (last resort).
 */
public final class LocatorShowcase {

    private final AppiumDriver driver = DriverManager.getDriver();

    // =====================================================================
    // 1) CROSS-PLATFORM (Selenium By) — work on Android and iOS
    // =====================================================================

    /** id — Android resource-id, iOS name/identifier. Fast and stable when present. */
    private final By byId = AppiumBy.id("com.example.app:id/username");

    /**
     * accessibilityId — Android content-desc, iOS accessibility identifier. PREFERRED: often
     * identical across platforms, survives UI refactors.
     */
    private final By byAccessibilityId = AppiumBy.accessibilityId("login-button");

    /**
     * className — widget type. Android: android.widget.EditText, iOS: XCUIElementTypeTextField.
     * Rarely unique on its own; combine with an index or parent.
     */
    private final By byClassName = AppiumBy.className("android.widget.EditText");

    /** name — legacy; maps to accessibility name on iOS. Prefer accessibilityId. */
    private final By byName = AppiumBy.name("login-button");

    /**
     * xpath — most flexible, SLOWEST and most brittle. Use only when nothing else works. Prefer
     * attribute matches over absolute paths.
     */
    private final By byXpathAttribute = AppiumBy.xpath("//*[@text='Login']");

    private final By byXpathContains =
            AppiumBy.xpath("//android.widget.TextView[contains(@text,'Welcome')]");
    private final By byXpathRelative =
            AppiumBy.xpath("//android.widget.LinearLayout/android.widget.Button[1]");

    // =====================================================================
    // 2) ANDROID-SPECIFIC
    // =====================================================================

    /** androidUIAutomator — powerful UiSelector DSL (scrolling, text, resourceId, etc.). */
    private final By byUiAutomatorText =
            AppiumBy.androidUIAutomator("new UiSelector().text(\"Login\")");

    private final By byUiAutomatorResourceId =
            AppiumBy.androidUIAutomator(
                    "new UiSelector().resourceId(\"com.example.app:id/username\")");
    private final By byUiAutomatorDescription =
            AppiumBy.androidUIAutomator("new UiSelector().descriptionContains(\"cart\")");

    /** UiScrollable — scrolls a scrollable container until the target is on screen. */
    private final By byUiScrollableIntoView =
            AppiumBy.androidUIAutomator(
                    "new UiScrollable(new UiSelector().scrollable(true))"
                            + ".scrollIntoView(new UiSelector().text(\"Terms and Conditions\"))");

    /** androidDataMatcher / androidViewMatcher — Espresso driver only (Hamcrest matchers). */
    private final By byDataMatcher =
            AppiumBy.androidDataMatcher(
                    "{\"name\": \"hasEntry\", \"args\": [\"title\", \"Item 1\"]}");

    // =====================================================================
    // 3) iOS-SPECIFIC
    // =====================================================================

    /** iOSNsPredicate — NSPredicate over element attributes. Fast, expressive. */
    private final By byIosPredicate =
            AppiumBy.iOSNsPredicateString(
                    "type == 'XCUIElementTypeButton' AND name == 'login-button'");

    private final By byIosPredicateLabel =
            AppiumBy.iOSNsPredicateString("label CONTAINS 'Welcome'");

    // iOSClassChain — faster than xpath, hierarchy-aware.
    // Syntax: a leading descendant marker (asterisk-asterisk-slash) then XCUIElementType...[index].
    private final By byIosClassChain =
            AppiumBy.iOSClassChain("**/XCUIElementTypeButton[`name == 'login-button'`]");
    private final By byIosClassChainIndexed =
            AppiumBy.iOSClassChain("**/XCUIElementTypeCell[2]/XCUIElementTypeStaticText[1]");

    // =====================================================================
    // 4) VISUAL
    // =====================================================================

    /**
     * image — locates by a reference image (base64). Enable the images plugin. Useful for
     * canvas/custom-drawn UI with no accessible attributes.
     */
    private final By byImage = AppiumBy.image("<base64-encoded-template-image>");

    /**
     * Expose the catalogue so docs/tests can reference it without instantiating logic. (Fields are
     * intentionally unused at runtime — this is a reference.)
     */
    public By[] all() {
        return new By[] {
            byId,
            byAccessibilityId,
            byClassName,
            byName,
            byXpathAttribute,
            byXpathContains,
            byXpathRelative,
            byUiAutomatorText,
            byUiAutomatorResourceId,
            byUiAutomatorDescription,
            byUiScrollableIntoView,
            byDataMatcher,
            byIosPredicate,
            byIosPredicateLabel,
            byIosClassChain,
            byIosClassChainIndexed,
            byImage
        };
    }

    /** Not used — present only so the driver field is referenced. */
    AppiumDriver driver() {
        return driver;
    }
}
