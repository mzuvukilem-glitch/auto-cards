# Architecture

This document explains how the framework is structured, what each component is
responsible for, and how a test flows from invocation to report.

## Design goals

| Goal | How it's achieved |
|------|-------------------|
| One test suite, two platforms | Platform-aware locators + per-thread `Platform` |
| Safe parallel execution | `ThreadLocal` driver, one driver per test thread |
| No hard-coded config | Externalised `.properties` + `-D` overrides, bound + validated into a typed `AutomationConfig` record via Spring Boot's `Binder` behind the `ConfigReader` facade (config binding only — no context/beans) |
| Readable failures | Allure `@Step`, auto screenshots, environment widget |
| Single source tree | Test-automation project: framework and tests both live under `src/test` (no `src/main`) |

## Layered view

```
Test Layer          tests/ · base/ · listeners/        (src/test)
      │  calls page objects, asserts outcomes
      ▼
Page Object Layer   pages/ (BasePage, *Page)            (src/test)
      │  tap/type/getText via PlatformLocator
      ▼
Driver Layer        driver/ (DriverFactory, Manager)    (src/test)
      │  one AppiumDriver + Platform per thread
      ▼
Config Layer        config/ (ConfigReader facade,        (src/test)
                    ConfigProvider → typed AutomationConfig
                    via Spring Binder, Caps)
      │  reads properties, builds capabilities
      ▼
Appium Server ──► UiAutomator2 (Android) / XCUITest (iOS) ──► Device/App
```

## Component responsibilities

### `driver/`
- **`DriverFactory`** — entry point for driver lifecycle. `initDriver(platform)`
  reads the server URL, builds capabilities, instantiates an `AndroidDriver` or
  `IOSDriver`, and records the resolved `Platform` on the current thread.
  `quitDriver()` quits and unloads the thread's driver.
- **`DriverManager`** — thread-safe holder. Keeps the `AppiumDriver` and the
  active `Platform` in `ThreadLocal`s so parallel threads never share state.
- **`Platform`** — `ANDROID` / `IOS` enum with safe parsing from a string.
- **`AppiumServerManager`** — optional programmatic start/stop of a local Appium
  server (useful in CI where no external server is managed). Gated by
  `-Dappium.server.autostart=true` (off by default); when on, it binds to the
  host/port from `appium.server.url` so it matches where `DriverFactory` connects.

### `config/`
- **`ConfigReader`** — public facade over the config layer; a matching
  `-Dkey=value` system property always overrides the file value (so CI can change
  behaviour without editing files). The `get`/`getBoolean`/`getInt` getters,
  precedence, and fail-fast validation are unchanged.
- **`ConfigProvider`** — loads and layers the properties and binds them with
  Spring Boot's `Binder` into a typed, immutable `AutomationConfig` record exposed
  via `ConfigProvider.config()`. Spring is used for config binding only — no
  application context, no beans, no `@Autowired`.
- **`CapabilitiesBuilder`** — builds platform-specific W3C capabilities
  (`UiAutomator2Options` / `XCUITestOptions`) from `android.properties` /
  `ios.properties`.

### `pages/`
- **`BasePage`** — base for all page objects. Wraps element interactions
  (`tap`, `type`, `getText`, `isDisplayed`, `waitForVisible`) with explicit waits.
  Provides overloads that accept a `PlatformLocator`.
- **`PlatformLocator`** — holds an Android locator and an iOS locator for one
  logical element and resolves the correct one for the active platform.
- **`LoginPage` / `HomePage` / `CheckoutPage`** — concrete screens. Declare
  locators and expose intent-revealing actions (e.g. `loginAs`), annotated with
  Allure `@Step`.

### `utils/`
- **`WaitUtils`** — fluent/explicit wait helpers.
- **`GestureUtils`** — W3C Actions-based swipe/scroll (cross-platform).
- **`JsonDataReader` / `ExcelReader`** — read test data from JSON / `.xlsx`.
- **`ScreenshotUtils`** — capture screenshots as bytes (Allure) or to disk.
- **`AllureEnvironmentWriter`** — writes `environment.properties` into the Allure
  results directory for the report's Environment widget.

### `constants/`
- **`FrameworkConstants`** — centralised paths, timeouts, and config keys.

### `src/test`
- **`base/BaseTest`** — TestNG lifecycle. `@BeforeSuite` writes Allure
  environment; `@BeforeMethod` initialises the driver for the test's platform;
  `@AfterMethod` quits it.
- **`tests/*`** — the actual tests, grouped `smoke` / `regression`.
- **`listeners/TestListener`** — logs lifecycle events and attaches a screenshot
  to Allure on failure.
- **`listeners/RetryAnalyzer`** — retries failed tests up to a configured count.

## Execution flow (single test)

```
testng.xml selects a <test> with platform=android|ios
   │
   ▼
@BeforeSuite  → AllureEnvironmentWriter.write()        (once per run)
@BeforeMethod → DriverFactory.initDriver(platform)
   │              ├─ ConfigReader.get(server url)
   │              ├─ CapabilitiesBuilder.build(platform)
   │              ├─ new AndroidDriver | IOSDriver
   │              └─ DriverManager.setDriver + setPlatform   (ThreadLocal)
   ▼
Test method   → new LoginPage().loginAs(...)
   │              └─ BasePage.tap(PlatformLocator)
   │                   └─ PlatformLocator.resolve()   → picks Android/iOS By
   ▼
Assertion
   │  (on failure) TestListener.onTestFailure → screenshot → Allure
   ▼
@AfterMethod  → DriverFactory.quitDriver()  → driver.quit() + DriverManager.unload()
```

## Threading model

- `parallel="tests"` in `testng.xml` runs each `<test>` block on its own thread.
- Each thread calls `initDriver` in `@BeforeMethod`, so it gets its **own**
  `AppiumDriver` and `Platform`, stored in `ThreadLocal`s.
- Page objects read the driver via `DriverManager.getDriver()`, which returns the
  current thread's driver — no shared mutable state, so Android and iOS suites can
  run concurrently.
- `DriverManager.unload()` removes both `ThreadLocal`s in teardown to avoid leaks
  across pooled threads.

## Extension points

| Need | Where to extend |
|------|-----------------|
| New screen | Add a `*Page` in `pages/` extending `BasePage` |
| New platform capability | `CapabilitiesBuilder` + the platform `.properties` |
| New data source | Add a reader in `utils/` |
| Cross-cutting behaviour | A TestNG listener in `listeners/` registered in `testng.xml` |
| Programmatic server | `AppiumServerManager.start()/stop()` from `BaseTest` |

See also: [WRITING_TESTS](WRITING_TESTS.md) · [CROSS_PLATFORM](CROSS_PLATFORM.md) · [CONFIGURATION](CONFIGURATION.md)
