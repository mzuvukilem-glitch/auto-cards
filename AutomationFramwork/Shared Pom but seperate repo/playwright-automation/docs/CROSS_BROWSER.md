# Cross-Browser & Parallel Execution

One test suite runs against Chromium, Firefox, and WebKit. This document explains
how the browser is selected and how parallel runs stay isolated.

## Selecting the browser

The engine is chosen per run from the `browser` config value (or `-Dbrowser`):

```
config.properties: browser=chromium        # or -Dbrowser=firefox
        │
        ▼
PlaywrightFactory.initPage()
        ├─ BrowserType.from("chromium|firefox|webkit")
        └─ playwright.chromium()/.firefox()/.webkit().launch(options)
```

```bash
mvn test -Dbrowser=chromium
mvn test -Dbrowser=firefox
mvn test -Dbrowser=webkit
```

`BrowserType.from(...)` also accepts the aliases `chrome` → Chromium and
`safari` → WebKit.

## The three engines

| Engine | Approximates | Notes |
|--------|--------------|-------|
| Chromium | Chrome / Edge | fastest, default |
| Firefox | Firefox | Playwright-patched build |
| WebKit | Safari | the only cross-platform way to test Safari behaviour |

All three ship as bundled binaries via `playwright install` — no system browsers
needed.

## Parallel execution model

JUnit 5 runs tests concurrently (`junit-platform.properties`). Isolation comes
from the ThreadLocal driver layer:

```
Thread A ─ initPage() ─► Playwright A ─ Browser A ─ Context A ─ Page A
Thread B ─ initPage() ─► Playwright B ─ Browser B ─ Context B ─ Page B
```

- Each test thread creates its own Playwright objects in `@BeforeEach`.
- `PlaywrightManager` stores them in `ThreadLocal`s; `getPage()` returns the
  current thread's page.
- `@AfterEach` closes everything and calls `unload()` to clear the ThreadLocals.
- No shared mutable state → no cross-test interference.

### Browser contexts vs browsers

Playwright `BrowserContext`s are cheap, fully isolated sessions (own cookies,
storage). The framework uses one context per test for clean isolation. If you
want to reduce launch cost, you could share a `Browser` per thread and open a
fresh `Context` per test — a straightforward change in `PlaywrightFactory`.

## Running one browser across the matrix in CI

Trigger the GitHub Actions workflow with a browser input, or run a matrix job per
browser. See [CI_CD](CI_CD.md). Locally, loop:

```bash
foreach ($b in 'chromium','firefox','webkit') { mvn test "-Dbrowser=$b" }
```

## Emulating devices / viewports

Set viewport in `config.properties` (`viewport.width/height`) or extend the
context options in `PlaywrightFactory` for mobile emulation (user agent, device
scale, touch). Playwright's device descriptors can be applied there if you want
`Pixel 7` / `iPhone 14` profiles.

## Reusing authentication (optional, faster suites)

Log in once, save the session, and reuse it so each test skips the login UI:

```java
// after a login, persist state
context.storageState(new BrowserContext.StorageStateOptions()
        .setPath(Paths.get("storage-state/auth.json")));

// in initPage(), load it
new Browser.NewContextOptions()
        .setStorageStatePath(Paths.get("storage-state/auth.json"));
```

See also: [CONFIGURATION](CONFIGURATION.md) · [ARCHITECTURE](ARCHITECTURE.md)
