# Locators & UI Interactions Reference

A complete catalogue of Appium **locator strategies** and **UI interactions**,
with examples. The runnable, heavily-commented source lives in:

- `src/main/java/com/company/automation/pages/examples/LocatorShowcase.java`
- `src/main/java/com/company/automation/pages/examples/InteractionShowcase.java`

These are reference classes (not real screens). In production, wrap locators in a
`PlatformLocator` and interactions in `BasePage` helpers — see
[WRITING_TESTS](WRITING_TESTS.md).

---

## Locator strategies

### Cross-platform (Selenium `By` / Appium `AppiumBy`)

| Strategy | Example | Notes |
|----------|---------|-------|
| `id` | `AppiumBy.id("com.example.app:id/username")` | Android resource-id / iOS name. Fast, stable. |
| `accessibilityId` | `AppiumBy.accessibilityId("login-button")` | **Preferred.** Android content-desc / iOS accessibility id; often identical on both. |
| `className` | `AppiumBy.className("android.widget.EditText")` | Widget type; rarely unique alone. |
| `name` | `AppiumBy.name("login-button")` | Legacy; prefer accessibilityId. |
| `xpath` (attribute) | `AppiumBy.xpath("//*[@text='Login']")` | Flexible but slow/brittle; prefer attribute matches. |
| `xpath` (contains) | `AppiumBy.xpath("//android.widget.TextView[contains(@text,'Welcome')]")` | Partial text match. |
| `xpath` (relative) | `AppiumBy.xpath("//android.widget.LinearLayout/android.widget.Button[1]")` | Positional; fragile if layout changes. |

### Android-specific

| Strategy | Example | Notes |
|----------|---------|-------|
| `androidUIAutomator` (text) | `AppiumBy.androidUIAutomator("new UiSelector().text(\"Login\")")` | UiSelector DSL. |
| `androidUIAutomator` (resourceId) | `...UiSelector().resourceId("com.example.app:id/username")` | Equivalent to id, via UiSelector. |
| `androidUIAutomator` (description) | `...UiSelector().descriptionContains("cart")` | content-desc partial match. |
| `UiScrollable` (scroll into view) | `new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().text("Terms"))` | Scrolls until the target is visible. |
| `androidDataMatcher` | `AppiumBy.androidDataMatcher("{...hasEntry...}")` | **Espresso driver only** (Hamcrest matchers). |

### iOS-specific

| Strategy | Example | Notes |
|----------|---------|-------|
| `iOSNsPredicateString` (type+name) | `AppiumBy.iOSNsPredicateString("type == 'XCUIElementTypeButton' AND name == 'login-button'")` | Fast, expressive. |
| `iOSNsPredicateString` (label) | `AppiumBy.iOSNsPredicateString("label CONTAINS 'Welcome'")` | Partial label match. |
| `iOSClassChain` | ``AppiumBy.iOSClassChain("**/XCUIElementTypeButton[`name == 'login-button'`]")`` | Faster than xpath, hierarchy-aware. |
| `iOSClassChain` (indexed) | `AppiumBy.iOSClassChain("**/XCUIElementTypeCell[2]/XCUIElementTypeStaticText[1]")` | Positional within the chain. |

### Visual

| Strategy | Example | Notes |
|----------|---------|-------|
| `image` | `AppiumBy.image("<base64 template>")` | Matches by reference image; needs the images plugin. For canvas/custom UI. |

### Choosing a strategy (stability order)

```
accessibilityId  >  id  >  platform selectors (UiAutomator / NsPredicate / ClassChain)  >  xpath
```

Prefer locators tied to intent (accessibility ids) over structure (xpath). In this
framework, pair an Android and iOS locator in a `PlatformLocator`:

```java
private final PlatformLocator loginButton = PlatformLocator.of(
        AppiumBy.id("com.example.app:id/btnLogin"),   // Android
        AppiumBy.accessibilityId("login-button"));    // iOS
```

---

## UI interactions

### Finding

| Interaction | Example |
|-------------|---------|
| Single element | `driver.findElement(locator)` (throws if absent) |
| Many elements | `driver.findElements(locator)` (empty list if none) |

### Waiting (always prefer over `Thread.sleep`)

| Wait | Example |
|------|---------|
| Visible | `wait.until(ExpectedConditions.visibilityOfElementLocated(by))` |
| Clickable | `wait.until(ExpectedConditions.elementToBeClickable(by))` |
| Gone (spinner) | `wait.until(ExpectedConditions.invisibilityOfElementLocated(by))` |

### Basic

| Interaction | Example |
|-------------|---------|
| Tap / click | `element.click()` |
| Type | `element.clear(); element.sendKeys("text")` |
| Clear | `element.clear()` |
| Read text | `element.getText()` |
| Read attribute | `element.getAttribute("content-desc")` (Android) / `"value"`, `"label"` (iOS) |
| State checks | `isDisplayed()`, `isEnabled()`, `isSelected()` |

### Keyboard / hardware keys

| Interaction | Example (portable `mobile:` command) |
|-------------|--------------------------------------|
| Hide keyboard | `driver.executeScript("mobile: hideKeyboard")` |
| Android BACK | `driver.executeScript("mobile: pressKey", Map.of("keycode", 4))` |

### Gestures (W3C Actions)

All gestures use `PointerInput` + `Sequence` — the cross-platform API since the
legacy `TouchAction` was removed.

| Gesture | How |
|---------|-----|
| Tap at coordinates | move → pointerDown → pointerUp |
| Long press | move → pointerDown → **Pause** → pointerUp |
| Swipe | move → down → move(duration) → up |
| Scroll | swipe across ~60% of the screen height |
| Drag & drop | down → pause → move to target → up |
| Pinch / zoom | **two** `PointerInput`s moving together/apart, performed in one `driver.perform(List.of(s1, s2))` |

Example (swipe):

```java
PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
Sequence swipe = new Sequence(finger, 1);
swipe.addAction(finger.createPointerMove(Duration.ZERO, viewport(), startX, startY));
swipe.addAction(finger.createPointerDown(LEFT.asArg()));
swipe.addAction(finger.createPointerMove(Duration.ofMillis(600), viewport(), endX, endY));
swipe.addAction(finger.createPointerUp(LEFT.asArg()));
driver.perform(List.of(swipe));
```

### Device / session

| Interaction | Example |
|-------------|---------|
| Rotate | `driver.executeScript("mobile: setOrientation", Map.of("orientation", "LANDSCAPE"))` |
| Screenshot | `((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES)` |
| Context switch (hybrid) | `mobile: getContexts` → `mobile: switchContext` to a `WEBVIEW_*`, then back to `NATIVE_APP` |

> **Note on `mobile:` commands vs concrete drivers.** This framework resolves
> java-client 9.x with Selenium 4.21 on the mirror. Some concrete
> `AndroidDriver`/`IOSDriver` convenience methods (e.g. `rotate`, `hideKeyboard`,
> context switching) transitively reference Selenium interfaces removed in newer
> versions, so the showcase uses the portable `driver.executeScript("mobile: ...")`
> form, which is also the Appium-recommended approach. If you align Selenium and
> java-client versions explicitly, the typed methods become available too.

---

## From reference to production

1. Put the locator pair in a `PlatformLocator` field on a real `*Page`.
2. Call `BasePage` helpers (`tap`, `type`, `getText`, `isDisplayed`) or add a
   gesture helper there (the project already has `GestureUtils.swipe`).
3. Keep tests asserting; keep pages acting.

See also: [WRITING_TESTS](WRITING_TESTS.md) · [CROSS_PLATFORM](CROSS_PLATFORM.md) · [ARCHITECTURE](ARCHITECTURE.md)
