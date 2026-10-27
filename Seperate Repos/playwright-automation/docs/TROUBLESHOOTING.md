# Troubleshooting

Common failures and fixes, grouped by stage.

## Build / dependency resolution

### `401 Unauthorized` on `mvn`
`~/.m2/settings.xml` is missing credentials for the repository mirror, or the
password is wrong. The `<server>` id must match the `<mirror>` id. See
[CONFIGURATION](CONFIGURATION.md#maven-repository-access).

### `429 Too many authentication attempts`
The mirror is rate-limiting. Wait a minute and retry; cache `~/.m2/repository` in
CI. Transient, not a code problem.

### `cannot find symbol` / compile errors
Run `mvn -B clean test-compile` and read the first error (later ones cascade).
Check JDK is 17 (`java -version`) and imports are correct
(e.g. `com.microsoft.playwright.options.*`).

## Browser install / launch

### `Executable doesn't exist ... run install`
Browsers aren't downloaded. Run:

```bash
mvn compile exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"
```

### WebKit/Firefox fails to launch on Linux/CI
Missing OS libraries. Use `install --with-deps` (not plain `install`) so the
system packages are fetched too.

### `Target page, context or browser has been closed`
Something closed the page before the action ran — usually teardown racing a late
async action, or reusing a page after `closePage()`. Each test gets a fresh page
in `@BeforeEach`; don't cache `Page`/`Locator` across tests.

## Element / locator failures

### `TimeoutError` waiting for a locator
Playwright auto-waits up to `default.timeout`. Causes:
- Wrong locator — verify with `mvn exec:java ... codegen <url>` or the Inspector.
- Element genuinely slow — raise `default.timeout` in config.
- Element in an iframe — scope with `page.frameLocator(...)`.

### Strict-mode violation: "resolved to N elements"
Your locator matched more than one node. Make it more specific (prefer
`getByRole`/`getByTestId`) or chain `.first()`/`.nth(i)` deliberately.

### Works headed, fails headless
Often timing or viewport. Confirm `viewport.*` is large enough; avoid relying on
hover-only UI. Run `-Dheadless=false -Dslowmo.ms=500` to watch it.

## Parallel execution

### Cross-talk between tests
Never hold a `Page`/`Browser` in a static field. Always go through
`PlaywrightManager.getPage()`. `unload()` in `@AfterEach` clears the ThreadLocals.

### Resource exhaustion with many workers
Too many concurrent browsers for the machine. Lower parallelism: switch the
strategy to `fixed` with a small `parallelism` in `junit-platform.properties`.

## Reporting

### Allure report empty / `@Step` missing
Ensure the AspectJ weaver `argLine` is active in Surefire (a `clean` build clears
stale state) and results landed in `target/allure-results`.

### Screenshots not attached on failure
Confirm `BaseTest` still has `@ExtendWith(ScreenshotOnFailure.class)` and the page
hasn't already been closed (teardown runs after the watcher, so it should be live).

### `mvn allure:serve` can't find Allure
The `allure-maven` plugin downloads what it needs; if offline, install the
standalone CLI and run `allure serve target/allure-results`.

## Logging

Logs go to console and `logs/automation.log` (`log4j2.xml`). Raise the
`com.company.automation` logger to `debug` when diagnosing.

## Still stuck?

- Reproduce with one test, one browser, headed:
  `mvn test -Dtest=LoginTests#validLogin -Dbrowser=chromium -Dheadless=false`
- Record a trace and open it in the trace viewer (see [REPORTING](REPORTING.md)).
- Use `codegen` to confirm the real selectors on the live page.

See also: [GETTING_STARTED](GETTING_STARTED.md) · [CONFIGURATION](CONFIGURATION.md)
