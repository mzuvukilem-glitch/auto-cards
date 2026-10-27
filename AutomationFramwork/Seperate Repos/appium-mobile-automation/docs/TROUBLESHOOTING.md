# Troubleshooting

Common failures and how to resolve them, grouped by stage.

## Build / dependency resolution

### `401 Unauthorized` on `mvn`
Your `~/.m2/settings.xml` is missing credentials for the repository mirror, or the
password is wrong. The `<server>` id must match the `<mirror>` id. See the main
[README](../README.md#maven-settings-artifact-repository-access).

### `429 Too many authentication attempts`
The mirror is rate-limiting you. Wait a minute and retry. Cache `~/.m2/repository`
in CI to cut repeated downloads. This is transient, not a code problem.

### `cannot find symbol` / compile errors
Run `mvn -B clean test-compile` and read the first error — later errors are often
cascades. Common causes: wrong import package (e.g. Selenium `interactions.*`),
JDK not 17 (`java -version`), or a typo in a new page/test.

## Appium server / session

### `Could not start a new session` / `session not created`
- The Appium server isn't running or the URL is wrong. Verify
  `appium.server.url` and that `appium` is listening (default `:4723`).
- The driver isn't installed: `appium driver list --installed`, then
  `appium driver install uiautomator2` / `xcuitest`.
- Capabilities point at a missing app: check `appFile` and that the binary is in
  `src/test/resources/apps/`.

### `A new session could not be created ... device`
No device/emulator is available.
- Android: `adb devices` should list a device; start an emulator if empty.
- iOS: `xcrun simctl list devices` should show a Booted simulator (macOS only).

### iOS: WebDriverAgent fails to build/launch
- Open the app in Xcode once and sign WDA with a valid team.
- Ensure Xcode command line tools match the Xcode version.
- Simulators can't run on Linux/Windows — iOS needs macOS.

## Element / locator failures

### `NoSuchElementException` / `TimeoutException` waiting for an element
- The locator is wrong for the active platform. Remember each element has an
  Android and iOS locator via `PlatformLocator`; verify the right one.
- The element isn't visible yet — `BasePage` already uses explicit waits; if a
  screen is genuinely slow, raise `FrameworkConstants.EXPLICIT_WAIT`.
- Inspect the live UI tree with **Appium Inspector** to confirm the real
  id/accessibility id.

### Works on Android, fails on iOS (or vice versa)
Almost always a locator mismatch. Prefer `AppiumBy.accessibilityId` where the app
exposes the same identifier on both platforms. See [CROSS_PLATFORM](CROSS_PLATFORM.md).

### `StaleElementReferenceException`
The screen re-rendered after you found the element. Re-find it (don't cache
`WebElement`s across actions) — the framework finds elements at interaction time,
so avoid storing them in fields.

## Parallel execution

### Cross-talk between Android and iOS runs
Each thread must create its own driver. Don't hold a driver in a static field;
always go through `DriverManager.getDriver()`. `unload()` in `@AfterMethod`
clears the `ThreadLocal`.

### Android port clashes with many parallel sessions
Pin a unique `systemPort` per session in `CapabilitiesBuilder`
(`UiAutomator2Options.setSystemPort(...)`) or let Appium auto-assign.

## Reporting

### Allure report is empty / missing steps
- Ensure the AspectJ weaver `argLine` is active in Surefire (it enables `@Step`).
  A `clean` build removes stale `target/` state.
- Confirm results landed in `target/allure-results`
  (`allure.results.directory`).

### Environment widget missing
`AllureEnvironmentWriter.write()` runs in `@BeforeSuite`. If you overrode
`BaseTest` lifecycle methods, call `super` or re-add the call.

### Screenshots not attached on failure
Confirm `TestListener` is registered in `testng.xml` `<listeners>` and the driver
is still alive at failure time (teardown runs after the listener).

## Logging

Logs go to console and `logs/automation.log` (see `log4j2.xml`). Raise framework
log level to `debug` there when diagnosing.

## Still stuck?

- Reproduce with a single test and one platform: `mvn test -Dplatform=android`.
- Open **Appium Inspector** against the same capabilities to validate locators.
- Check the Appium server log — it shows the exact command that failed.

See also: [GETTING_STARTED](GETTING_STARTED.md) · [CONFIGURATION](CONFIGURATION.md)
