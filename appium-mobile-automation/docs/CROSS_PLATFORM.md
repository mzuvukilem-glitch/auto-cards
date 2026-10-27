# Cross-Platform Support (Android + iOS)

A single set of tests and page objects drives both Android and iOS. This document
explains the locator strategy, how the platform is selected, and how parallel
cross-platform runs work.

## The core idea

Every UI element usually has a **different locator** on Android vs iOS. Instead of
duplicating page objects per platform, each element declares both locators and the
framework resolves the right one at runtime.

```java
private final PlatformLocator loginButton = PlatformLocator.of(
        AppiumBy.id("com.example.app:id/btnLogin"),   // Android (resource-id)
        AppiumBy.accessibilityId("login-button"));    // iOS (accessibility id)
```

`PlatformLocator.resolve()` reads the active `Platform` from `DriverManager`
(set per-thread when the driver was created) and returns the matching `By`.

## Locator strategy guide

| Strategy | Android | iOS | Recommendation |
|----------|---------|-----|----------------|
| `accessibilityId` | `content-desc` | accessibility identifier | **Preferred** — often identical on both |
| `id` | resource-id | name | Reliable on Android; brittle on iOS |
| `className` | widget class | XCUIElement type | Avoid as a sole locator |
| `xpath` | supported | supported | Last resort — slow and fragile |
| `androidUIAutomator` | UiSelector | — | Android-only power tool |
| `iOSNsPredicate` / `iOSClassChain` | — | predicate / class chain | iOS power tools |

**Tip:** if your app sets the same accessibility identifier on both platforms,
you can use one locator for both and skip the pair.

## How platform is selected

```
testng.xml <parameter name="platform" value="android|ios"/>
      │  (or -Dplatform=... which overrides it)
      ▼
BaseTest.setUp(platform)
      ▼
DriverFactory.initDriver(platform)
      ├─ Platform.from(platform)                → ANDROID | IOS
      ├─ CapabilitiesBuilder.build(platform)    → UiAutomator2Options | XCUITestOptions
      ├─ new AndroidDriver | IOSDriver
      └─ DriverManager.setDriver + setPlatform  (ThreadLocal, per thread)
```

From then on, every `PlatformLocator.resolve()` call on that thread returns the
correct platform's locator.

## Parallel cross-platform execution

`testng.xml` declares separate Android and iOS `<test>` blocks:

```xml
<suite name="AppiumMobileSuite" parallel="tests" thread-count="4">
    <test name="Smoke Tests - Android"> <parameter name="platform" value="android"/> ... </test>
    <test name="Regression Tests - Android"> <parameter name="platform" value="android"/> ... </test>
    <test name="Smoke Tests - iOS"> <parameter name="platform" value="ios"/> ... </test>
    <test name="Regression Tests - iOS"> <parameter name="platform" value="ios"/> ... </test>
</suite>
```

- `parallel="tests"` runs each `<test>` block on its own thread.
- Each thread initialises its own driver in `@BeforeMethod`, so Android and iOS
  sessions never collide.
- `thread-count` caps concurrency — size it to your available devices/sessions.

### Requirements for true parallel runs

- One Appium server session per concurrent thread (a single Appium 2.x server
  handles multiple sessions; a Selenium/Appium Grid or device cloud scales further).
- Enough devices/emulators/simulators to back each session.
- Unique system ports per Android session if you pin them
  (`UiAutomator2Options.setSystemPort(...)`), otherwise let Appium auto-assign.

## Running one platform at a time

```bash
mvn test -Dplatform=android
mvn test -Dplatform=ios
```

The `-Dplatform` override wins over the suite parameter, so every `<test>` block
runs against the platform you pass.

## Handling platform-only screens or steps

If a screen exists on only one platform, guard it by reading the platform:

```java
if (DriverManager.getPlatform() == Platform.IOS) {
    // dismiss an iOS-only system dialog
}
```

Keep such branches rare and localised — most differences belong in the locator
pair, not in test logic.

See also: [WRITING_TESTS](WRITING_TESTS.md) · [CONFIGURATION](CONFIGURATION.md) · [ARCHITECTURE](ARCHITECTURE.md)
