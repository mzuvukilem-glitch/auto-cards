package com.company.automation.pages.examples;

import com.company.automation.driver.DriverManager;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.AppiumDriver;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.Point;
import org.openqa.selenium.Rectangle;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Pause;
import org.openqa.selenium.interactions.PointerInput;
import org.openqa.selenium.interactions.Sequence;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

/**
 * REFERENCE ONLY — a catalogue of common mobile UI interactions in Appium
 * (Java client v9+, W3C Actions). Every method is heavily commented to show the
 * idiomatic way to do each gesture/interaction. Not a real screen.
 *
 * <p>Gestures use the W3C Actions API ({@link PointerInput}/{@link Sequence}),
 * which is the cross-platform way since the legacy TouchAction API was removed.
 */
public final class InteractionShowcase {

    private final AppiumDriver driver = DriverManager.getDriver();
    private final WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));

    // Example locators reused below.
    private final org.openqa.selenium.By field = AppiumBy.accessibilityId("username");
    private final org.openqa.selenium.By button = AppiumBy.accessibilityId("login-button");

    // =====================================================================
    // FINDING
    // =====================================================================

    /** Find a single element (throws if absent). */
    public WebElement find() {
        return driver.findElement(button);
    }

    /** Find many (empty list if none) — never throws, good for counts. */
    public List<WebElement> findAll() {
        return driver.findElements(AppiumBy.className("android.widget.TextView"));
    }

    // =====================================================================
    // WAITING (prefer explicit waits over Thread.sleep)
    // =====================================================================

    public WebElement waitVisible() {
        // Wait until the element is present AND displayed.
        return wait.until(ExpectedConditions.visibilityOfElementLocated(button));
    }

    public WebElement waitClickable() {
        // Wait until enabled and ready to receive a tap.
        return wait.until(ExpectedConditions.elementToBeClickable(button));
    }

    public boolean waitGone() {
        // Wait until the element disappears (e.g. a spinner).
        return wait.until(ExpectedConditions.invisibilityOfElementLocated(
                AppiumBy.accessibilityId("loading-spinner")));
    }

    // =====================================================================
    // BASIC INTERACTIONS
    // =====================================================================

    public void tap() {
        waitClickable().click();                 // standard tap/click
    }

    public void typeText() {
        WebElement input = waitVisible();
        input.clear();                            // clear existing text first
        input.sendKeys("hello@example.com");      // type
    }

    public void clearText() {
        waitVisible().clear();
    }

    public String readText() {
        return waitVisible().getText();           // visible text
    }

    public String readAttribute() {
        // Common attributes: "text", "content-desc", "enabled", "checked",
        // "displayed", "bounds" (Android) / "value", "label", "name" (iOS).
        return find().getAttribute("content-desc");
    }

    public boolean stateChecks() {
        WebElement el = find();
        return el.isDisplayed() && el.isEnabled() && el.isSelected();
    }

    // =====================================================================
    // KEYBOARD / HARDWARE KEYS
    // =====================================================================

    public void hideKeyboard() {
        // Portable approach via the mobile command (works on Android and iOS).
        try {
            driver.executeScript("mobile: hideKeyboard");
        } catch (Exception ignored) {
            // No keyboard shown — safe to ignore.
        }
    }

    public void pressAndroidBack() {
        // Android hardware/nav keys via the portable mobile command.
        // keycode 4 = BACK (see Android KeyEvent constants).
        driver.executeScript("mobile: pressKey", java.util.Map.of("keycode", 4));
    }

    // =====================================================================
    // W3C GESTURES — tap, long-press, swipe, scroll, drag, pinch/zoom
    // =====================================================================

    /** Precise tap at coordinates (when there's no element to target). */
    public void tapAtCoordinates(int x, int y) {
        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence tap = new Sequence(finger, 1);
        tap.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), x, y));
        tap.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        tap.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
        driver.perform(List.of(tap));
    }

    /** Long press — press, pause, release. */
    public void longPress() {
        Point center = centerOf(find());
        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence lp = new Sequence(finger, 1);
        lp.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), center.x, center.y));
        lp.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        lp.addAction(new Pause(finger, Duration.ofMillis(1200)));   // hold
        lp.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
        driver.perform(List.of(lp));
    }

    /** Swipe between two points over a duration. */
    public void swipe(int startX, int startY, int endX, int endY) {
        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence swipe = new Sequence(finger, 1);
        swipe.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), startX, startY));
        swipe.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        swipe.addAction(finger.createPointerMove(Duration.ofMillis(600), PointerInput.Origin.viewport(), endX, endY));
        swipe.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
        driver.perform(List.of(swipe));
    }

    /** Scroll down a screen height (swipe up). */
    public void scrollDown() {
        Dimension size = driver.manage().window().getSize();
        swipe(size.width / 2, (int) (size.height * 0.8), size.width / 2, (int) (size.height * 0.2));
    }

    /** Drag an element onto a target element. */
    public void dragAndDrop(WebElement source, WebElement target) {
        Point from = centerOf(source);
        Point to = centerOf(target);
        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence drag = new Sequence(finger, 1);
        drag.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), from.x, from.y));
        drag.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        drag.addAction(new Pause(finger, Duration.ofMillis(400)));            // let the UI pick it up
        drag.addAction(finger.createPointerMove(Duration.ofMillis(800), PointerInput.Origin.viewport(), to.x, to.y));
        drag.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
        driver.perform(List.of(drag));
    }

    /** Pinch to zoom OUT — two fingers moving together (needs two pointer inputs). */
    public void pinchZoomOut() {
        Point c = centerOf(find());
        PointerInput f1 = new PointerInput(PointerInput.Kind.TOUCH, "finger1");
        PointerInput f2 = new PointerInput(PointerInput.Kind.TOUCH, "finger2");
        Sequence s1 = new Sequence(f1, 0);
        Sequence s2 = new Sequence(f2, 0);
        // Finger 1 starts far out, moves toward centre.
        s1.addAction(f1.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), c.x - 200, c.y));
        s1.addAction(f1.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        s1.addAction(f1.createPointerMove(Duration.ofMillis(600), PointerInput.Origin.viewport(), c.x - 40, c.y));
        s1.addAction(f1.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
        // Finger 2 mirrors on the other side.
        s2.addAction(f2.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), c.x + 200, c.y));
        s2.addAction(f2.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        s2.addAction(f2.createPointerMove(Duration.ofMillis(600), PointerInput.Origin.viewport(), c.x + 40, c.y));
        s2.addAction(f2.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
        driver.perform(List.of(s1, s2));
    }

    // =====================================================================
    // DEVICE / SESSION
    // =====================================================================

    public void rotate() {
        // Portable approach: the W3C "setOrientation" endpoint via executeScript.
        // (Avoids coupling to concrete AndroidDriver/IOSDriver methods.)
        driver.executeScript("mobile: setOrientation",
                java.util.Map.of("orientation", "LANDSCAPE"));   // or PORTRAIT
    }

    public byte[] screenshot() {
        return ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
    }

    @SuppressWarnings("unchecked")
    public void switchToWebContext() {
        // Hybrid apps: list contexts and switch to the WEBVIEW to drive HTML with CSS/xpath.
        // The "mobile: getContexts" / standard context switch is exposed generically.
        Object contexts = driver.executeScript("mobile: getContexts");
        if (contexts instanceof java.util.List<?> list) {
            for (Object ctx : list) {
                String name = String.valueOf(ctx);
                if (name.contains("WEBVIEW")) {
                    // Switch via the W3C context endpoint, then back to native when done.
                    driver.executeScript("mobile: switchContext", java.util.Map.of("name", name));
                    break;
                }
            }
            driver.executeScript("mobile: switchContext", java.util.Map.of("name", "NATIVE_APP"));
        }
    }

    // =====================================================================
    // HELPERS
    // =====================================================================

    /** Centre point of an element — useful for coordinate-based gestures. */
    private Point centerOf(WebElement el) {
        Rectangle r = el.getRect();
        return new Point(r.getX() + r.getWidth() / 2, r.getY() + r.getHeight() / 2);
    }

    /** Referenced so 'field' isn't flagged unused in this reference class. */
    org.openqa.selenium.By[] exampleLocators() {
        return new org.openqa.selenium.By[]{field, button};
    }
}
