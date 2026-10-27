# Playwright Web Automation Framework

<!-- CI badges — replace the placeholder owner/repo and host URLs with your own. -->
[![GitHub Actions](https://github.com/OWNER/playwright-automation/actions/workflows/playwright-tests.yml/badge.svg)](https://github.com/OWNER/playwright-automation/actions/workflows/playwright-tests.yml)
[![GitLab pipeline](https://gitlab.example.com/GROUP/playwright-automation/badges/main/pipeline.svg)](https://gitlab.example.com/GROUP/playwright-automation/-/pipelines)
[![Azure DevOps](https://dev.azure.com/ORG/PROJECT/_apis/build/status/playwright-automation?branchName=main)](https://dev.azure.com/ORG/PROJECT/_build/latest?definitionId=ID&branchName=main)
[![Jenkins](https://img.shields.io/badge/Jenkins-pipeline-blue?logo=jenkins)](https://jenkins.example.com/job/playwright-automation/)

Playwright for Java + JUnit 5 + Maven web **UI and API** automation framework
using the Page Object Model (POM), with thread-safe parallel execution,
externalised config, multi-browser support (Chromium / Firefox / WebKit),
built-in API testing via `APIRequestContext`, Log4j2 logging, Allure reporting,
and CI integration.

## CI

Ready-to-use pipelines for four CI platforms. They run the same Maven commands;
only the wrapper differs. Browsers are bundled, so every pipeline runs on
standard agents — see [docs/CI_CD.md](docs/CI_CD.md) for per-platform detail, and
[docs/CI_DEPLOYMENT.md](docs/CI_DEPLOYMENT.md) for step-by-step setup on each platform.

| Platform | Config file |
|----------|-------------|
| GitHub Actions | [`.github/workflows/playwright-tests.yml`](.github/workflows/playwright-tests.yml) |
| GitLab CI | [`.gitlab-ci.yml`](.gitlab-ci.yml) |
| Jenkins | [`Jenkinsfile`](Jenkinsfile) |
| Azure DevOps | [`azure-pipelines.yml`](azure-pipelines.yml) |

> The badges above use placeholder URLs (`OWNER`, `GROUP`, `ORG/PROJECT`, host
> names). Replace them with your repository's real coordinates to make them live.

## Documentation

Full documentation lives in [`docs/`](docs/README.md):

- [Getting Started](docs/GETTING_STARTED.md) — setup, browser install, first run
- [Architecture](docs/ARCHITECTURE.md) — components, flow, threading
- [Writing Tests](docs/WRITING_TESTS.md) — pages, locators, parameterised data
- [API Testing](docs/API_TESTING.md) — HTTP tests via APIRequestContext (no browser)
- [Configuration](docs/CONFIGURATION.md) — properties, overrides, launch options
- [Cross-Browser](docs/CROSS_BROWSER.md) — Chromium/Firefox/WebKit, parallelism
- [Reporting](docs/REPORTING.md) — Allure, screenshots, trace & video
- [CI/CD](docs/CI_CD.md) — GitHub Actions, matrix, caching
- [Troubleshooting](docs/TROUBLESHOOTING.md) — common failures and fixes
- [Contributing](docs/CONTRIBUTING.md) — conventions and workflow

## Tech stack

| Concern           | Choice                             |
|-------------------|------------------------------------|
| Language          | Java 17                            |
| Build             | Maven                              |
| Browser automation| Playwright for Java                |
| API testing       | Playwright `APIRequestContext`     |
| Test runner       | JUnit 5 (Jupiter)                  |
| Reporting         | Allure                             |
| Logging           | Log4j2                             |
| Data              | JUnit params / JSON (Jackson)      |

## Project layout

```
playwright-automation/
├── pom.xml                                  # dependencies + build
├── src/main/java/com/company/automation/
│   ├── config/
│   │   ├── ConfigReader.java                # reads config.properties (-D overrides)
│   │   └── BrowserType.java                 # CHROMIUM / FIREFOX / WEBKIT
│   ├── driver/
│   │   ├── PlaywrightFactory.java           # launches browser/context/page
│   │   └── PlaywrightManager.java           # ThreadLocal holders (parallel-safe)
│   ├── pages/
│   │   ├── BasePage.java                    # common actions
│   │   ├── LoginPage.java
│   │   ├── InventoryPage.java
│   │   ├── CartPage.java
│   │   └── CheckoutPage.java
│   └── utils/
│       └── ScreenshotUtils.java
├── src/test/java/com/company/automation/
│   ├── base/
│   │   ├── BaseTest.java                     # @BeforeEach/@AfterEach lifecycle
│   │   └── ScreenshotOnFailure.java          # JUnit5 TestWatcher → Allure
│   └── tests/
│       ├── SmokeTests.java
│       ├── LoginTests.java                    # @Test + @ParameterizedTest
│       └── CheckoutTests.java                 # end-to-end purchase
└── src/test/resources/
    ├── config.properties                      # base URL, browser, timeouts
    ├── junit-platform.properties              # parallel execution
    ├── allure.properties                      # Allure results dir + links
    └── log4j2.xml
```

## Build configuration (shared parent POM)

This project is part of a Maven reactor. It inherits versions and plugin wiring
from [`automation-parent`](../automation-parent) and depends on
[`automation-commons`](../automation-commons) for shared code (`Secrets`,
`RunMetadata`, `JsonUtils`). Build everything from the workspace root, or install
the shared modules first:

```bash
# Option A — build the whole reactor (recommended)
mvn -f ../pom.xml clean install

# Option B — install shared modules, then build this framework alone
mvn -f ../automation-parent/pom.xml install
mvn -f ../automation-commons/pom.xml install
mvn clean test-compile
```

Dependency versions live in the parent; this POM only lists which dependencies it
uses (no `<version>`) plus Playwright-specific config (Surefire `excludedGroups`,
the browser-install exec plugin).

## Prerequisites

- JDK 17+
- Maven 3.9+
- Playwright browsers (installed via Maven, see below) — no separate Node needed

## Install browsers

Playwright for Java downloads its own browser binaries. Install them once:

```bash
mvn compile exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"
```

## Running

```bash
# All tests, default browser (chromium) from config.properties
mvn test

# Pick a browser at runtime
mvn test -Dbrowser=firefox
mvn test -Dbrowser=webkit

# Headed (watch it run)
mvn test -Dheadless=false

# Only smoke / regression (JUnit 5 tags)
mvn test -Dgroups=smoke
mvn test -Dgroups=regression

# API tests only (no browser needed) — see docs/API_TESTING.md
mvn test -Dgroups=api
```

## UI and API testing

This framework covers both **UI** (browser) and **API** (HTTP) testing with the
same toolchain. API tests use Playwright's `APIRequestContext` — no browser, no
extra HTTP library — and report into the same Allure output. Tag API tests
`@Tag("api")` and run them with `-Dgroups=api`. Full guide:
[docs/API_TESTING.md](docs/API_TESTING.md).

## Configuration

All settings live in `src/test/resources/config.properties` and are overridable
with `-Dkey=value` (system property wins over the file):

| Key | Purpose |
|-----|---------|
| `base.url` | App under test |
| `browser` | chromium / firefox / webkit |
| `headless` | true / false |
| `slowmo.ms` | slow actions for debugging |
| `viewport.width` / `viewport.height` | window size |
| `default.timeout` / `navigation.timeout` | timeouts (ms) |

Example: `mvn test -Dbase.url=https://staging.example.com -Dheadless=false`

## Cross-browser & parallel execution

- Browser engine is chosen per run via `browser` (config or `-Dbrowser`).
- `PlaywrightManager` keeps the `Playwright`/`Browser`/`BrowserContext`/`Page` in
  `ThreadLocal`s, so tests run in parallel without sharing state.
- Parallelism is enabled in `src/test/resources/junit-platform.properties`
  (`junit.jupiter.execution.parallel.enabled=true`, dynamic strategy).

## Reports (Allure)

Raw results are written to `target/allure-results`. Tests use `@DisplayName`,
`@Description`, `@Severity` and page methods carry `@Step`; failure screenshots
are attached automatically by the `ScreenshotOnFailure` extension.

```bash
mvn test
mvn allure:serve      # render + open in a browser
mvn allure:report     # render HTML to target/site/allure-maven-plugin
```

## Writing a test

1. Add a Page Object in `src/main/.../pages/` extending `BasePage`; expose
   intent-revealing actions annotated with `@Step`, returning the next page.
2. Add a test class in `src/test/.../tests/` extending `BaseTest`; tag it
   `@Tag("smoke")` / `@Tag("regression")` and assert with JUnit 5.
3. Use `@ParameterizedTest` + `@CsvSource`/`@MethodSource` for data-driven cases
   (see `LoginTests`).

## Diagnostics on failure

- **Screenshots** — attached to the Allure report via `ScreenshotOnFailure`.
- **Trace** — Playwright trace is configured for retries; open with
  `npx playwright show-trace <trace.zip>` or the trace viewer.
- **Video** — recorded to `videos/` (kept on failure in CI).

## CI

`.github/workflows/playwright-tests.yml` runs on push/PR: sets up JDK 17,
installs browsers with OS deps, runs tests, generates the Allure report, and
uploads results/report plus failure videos as artifacts.

## Verifying the build (no browser needed)

```bash
mvn -B clean test-compile
```

A clean exit means the framework and dependencies are wired correctly. Running
the actual tests additionally downloads browsers and needs network access to the
app under test.
