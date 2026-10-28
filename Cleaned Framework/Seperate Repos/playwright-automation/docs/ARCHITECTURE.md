# Architecture

How the framework is structured, what each component does, and how a test flows
from invocation to report.

## Design goals

| Goal | How it's achieved |
|------|-------------------|
| One suite, any browser | `browser` config + `PlaywrightFactory` launches Chromium/Firefox/WebKit |
| Safe parallel execution | `ThreadLocal` Playwright/Browser/Context/Page per test thread |
| No hard-coded config | Externalised `config.properties` + `-D` overrides, bound into a typed `PlaywrightConfig` record via Spring Boot's `Binder` behind the `ConfigReader` facade |
| Readable failures | Allure `@Step`, auto screenshots, trace on failure |
| Single source tree | test-automation project — all code lives under `src/test` (no `src/main`) |

## Layered view

```
Test Layer          base/ · tests/                     (src/test)
      │  calls page objects, asserts with JUnit 5
      ▼
Page Object Layer   pages/ (BasePage, *Page)            (src/test)
      │  click/fill/text via Playwright Locators
      ▼
Driver Layer        driver/ (Factory, Manager)          (src/test)
      │  one Playwright+Browser+Context+Page per thread
      ▼
Config Layer        config/ (ConfigReader, BrowserType) (src/test)
      │  reads properties, selects browser engine
      ▼
Playwright  ──►  Chromium | Firefox | WebKit  ──►  App under test
```

## Component responsibilities

### `driver/`
- **`PlaywrightFactory`** — `initPage()` creates a `Playwright` instance, launches
  the configured browser, opens a `BrowserContext` (viewport) and a `Page`,
  storing each in `PlaywrightManager`. The context optionally records video when
  `record.video=true` (off by default). `closePage()` closes them and clears the
  ThreadLocals.
- **`PlaywrightManager`** — thread-safe holder. Keeps `Playwright`, `Browser`,
  `BrowserContext`, and `Page` in `ThreadLocal`s so parallel threads never share
  browser state.

### `config/`
- **`ConfigReader`** — public facade over `ConfigProvider`; loads from the
  classpath, a matching `-Dkey=value` always overrides. Same typed getters
  (`getBoolean`, `getInt`), same precedence and fail-fast validation.
- **`ConfigProvider`** — loads and layers the properties and binds them with
  Spring Boot's `Binder` into a typed, immutable `PlaywrightConfig` record
  (`ConfigProvider.config()`). Spring is used for config binding only — no
  application context, no beans, no DI. `PlaywrightFactory` reads this typed config.
- **`BrowserType`** — `CHROMIUM` / `FIREFOX` / `WEBKIT` enum with safe parsing
  (accepts `chrome`/`safari` aliases).

### `pages/`
- **`BasePage`** — base for all page objects. Wraps `click`, `type`, `text`,
  `isVisible`, and `open()` (navigate to `base.url + path()`). Playwright locators
  auto-wait, so explicit waits are rarely needed.
- **`LoginPage` / `InventoryPage` / `CartPage` / `CheckoutPage`** — concrete
  screens exposing intent-revealing actions annotated with Allure `@Step`, each
  returning the next page object to enable fluent chains.

### `utils/`
- **`ScreenshotUtils`** — captures a full-page screenshot as bytes for Allure.

### `src/test`
- **`base/BaseTest`** — JUnit 5 lifecycle. `@BeforeEach` creates the page via
  `PlaywrightFactory.initPage()`; `@AfterEach` tears it down. `@ExtendWith` wires
  the failure-screenshot extension. `openLogin()` convenience navigates to the app.
- **`base/ScreenshotOnFailure`** — JUnit 5 `TestWatcher`; on `testFailed` captures
  a screenshot and attaches it to the Allure report.
- **`tests/*`** — the actual tests, tagged `@Tag("smoke")` / `@Tag("regression")`.

## Execution flow (single test)

```
JUnit 5 selects a test (optionally filtered by @Tag)
   │
   ▼
@BeforeEach → PlaywrightFactory.initPage()
   │             ├─ Playwright.create()
   │             ├─ BrowserType.from(config "browser")
   │             ├─ launch chromium | firefox | webkit
   │             ├─ newContext(viewport) + timeouts
   │             │     └─ record video → videos/  (only if record.video=true)
   │             ├─ newPage()
   │             └─ PlaywrightManager.set*  (ThreadLocal)
   ▼
Test method → openLogin().login(...).addToCart(...)...
   │             └─ BasePage.click/type → Playwright Locator (auto-wait)
   ▼
JUnit 5 assertions
   │  (on failure) ScreenshotOnFailure.testFailed → screenshot → Allure
   ▼
@AfterEach  → PlaywrightFactory.closePage() → close context/browser/playwright + unload()
```

## Threading model

- JUnit 5 parallel execution is enabled in `junit-platform.properties`
  (`parallel.enabled=true`, `mode.default=concurrent`, dynamic strategy).
- Each test thread calls `initPage()` in `@BeforeEach`, getting its **own**
  `Playwright`/`Browser`/`BrowserContext`/`Page` stored in `ThreadLocal`s.
- Page objects read the page via `PlaywrightManager.getPage()` → the current
  thread's page. No shared mutable state, so tests run concurrently and safely.
- `unload()` removes the ThreadLocals in teardown to avoid leaks across pooled
  threads.

## Why Playwright (vs Selenium)

- **Auto-waiting locators** remove most explicit waits and flakiness.
- **Browser contexts** are cheap, isolated sessions — ideal for parallelism.
- **Built-in tracing and screenshots** make failures debuggable.
- **One API across Chromium/Firefox/WebKit** with bundled browser binaries.

## Extension points

| Need | Where to extend |
|------|-----------------|
| New screen | Add a `*Page` in `pages/` extending `BasePage` |
| New browser option | `PlaywrightFactory` launch/context options |
| New config value | Add to `config.properties`, read via `ConfigReader` |
| Cross-cutting behaviour | A JUnit 5 extension in `base/`, wired with `@ExtendWith` |
| Auth reuse | Save/load `storageState` in the context (speeds up login) |

See also: [WRITING_TESTS](WRITING_TESTS.md) · [CROSS_BROWSER](CROSS_BROWSER.md) · [CONFIGURATION](CONFIGURATION.md)
