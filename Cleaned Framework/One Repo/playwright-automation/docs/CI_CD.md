# CI/CD

The framework ships ready-to-use pipelines for **four** CI platforms. They all
follow the same shape and run the same Maven commands, so switching CI systems
changes only the wrapper, not the framework. Because Playwright bundles its own
browsers, every pipeline runs on standard hosted agents — no device or system
browser required.

> **Deploying for the first time?** See [CI_DEPLOYMENT.md](CI_DEPLOYMENT.md) for
> step-by-step setup instructions for each platform (secrets, runners/agents,
> browser caching, reports).

## CI files at a glance

| Platform | File | Notes |
|----------|------|-------|
| GitHub Actions | `.github/workflows/playwright-tests.yml` | single run + artifact upload; browser via `workflow_dispatch` input |
| GitLab CI | `.gitlab-ci.yml` | cross-browser matrix (chromium/firefox/webkit) |
| Jenkins | `Jenkinsfile` | declarative pipeline; `BROWSER`/`HEADLESS` params; Allure plugin |
| Azure DevOps | `azure-pipelines.yml` | Build + Test matrix across the three engines |

## The common pipeline shape

```
Build (compile)  →  Install browsers  →  Test  →  Generate + publish Allure
```

- **Build** runs `mvn -B clean test-compile` — fast, catches compile/dependency
  issues before downloading browsers.
- **Install browsers** runs the Playwright CLI with `install --with-deps` so
  Chromium/Firefox/WebKit (and Linux OS libraries) are present.
- **Test** runs `mvn -B test -Dbrowser=<engine> -Dheadless=true`.
- **Publish** renders the Allure report and uploads results/artifacts.

## Installing browsers in CI

```bash
mvn -B compile exec:java -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install --with-deps"
```

`--with-deps` also fetches the system libraries WebKit/Firefox need on fresh
Ubuntu images, so they launch cleanly. Cache `~/.cache/ms-playwright` (keyed on
the Playwright version) to skip re-downloading between runs.

## API tests in CI

API tests (`@Tag("api")`) use Playwright's `APIRequestContext` and need **no
browser** — they run on any agent with just JDK + Maven. You can split them into
a fast, browser-free job that runs before the UI matrix:

```bash
mvn -B test -Dgroups=api        # fast; no 'install browsers' step required
```

This is a cheap early signal; keep the browser install + UI matrix for the
heavier stage. See [API_TESTING.md](API_TESTING.md).

## GitHub Actions

`.github/workflows/playwright-tests.yml`: sets up JDK 17 (with Maven cache),
installs browsers with OS deps, runs the suite, generates the Allure report, and
uploads `allure-results`, the HTML report, and `test-results`.
The `workflow_dispatch` input `browser` selects the engine for manual runs.

For a full matrix in one run:

```yaml
strategy:
  fail-fast: false
  matrix:
    browser: [chromium, firefox, webkit]
steps:
  - run: mvn -B test -Dbrowser=${{ matrix.browser }} -Dheadless=true
```

## GitLab CI

`.gitlab-ci.yml` stages: `build` → `test` → `report`.

- `build` compiles on `maven:3.9-eclipse-temurin-17`.
- `test:chromium`, `test:firefox`, `test:webkit` share a YAML anchor template,
  install browsers, and run their engine; results are uploaded and
  JUnit XML is surfaced via `reports:junit`.
- `allure-report` renders the HTML report.
- Caches both `.m2/repository` and `.cache/ms-playwright`
  (via `PLAYWRIGHT_BROWSERS_PATH`).

## Jenkins

`Jenkinsfile` is a declarative pipeline with `BROWSER` and `HEADLESS` parameters.
Stages: Checkout → Build → Install browsers → Test → Allure report. It pins
`PLAYWRIGHT_BROWSERS_PATH` inside the workspace for cache reuse. The `post` block
publishes JUnit results, archives the HTML report, and publishes
Allure (requires the **Allure Jenkins plugin**).

## Azure DevOps

`azure-pipelines.yml` has two stages:

- `Build` — `mvn clean test-compile` on `ubuntu-latest` with a Maven cache.
- `Test` — a `matrix` over `chromium`/`firefox`/`webkit`; each leg installs
  browsers, runs its engine, renders Allure, publishes JUnit results, and uploads
  a per-browser report artifact.

## Caching

| Cache | Why |
|-------|-----|
| `~/.m2/repository` | avoid re-downloading Maven dependencies; reduces mirror `429`s |
| `~/.cache/ms-playwright` | avoid re-downloading browser binaries (key on Playwright version) |

## Headless & stability

- Always run `-Dheadless=true` in CI.
- Add `--disable-dev-shm-usage` to Chromium launch args for small runners
  (see [CONFIGURATION](CONFIGURATION.md)).
- JUnit parallelism uses the dynamic strategy; keep it modest on shared runners.

## Publishing the report

- **Artifacts** — upload `target/site/allure-maven-plugin` (done in all four).
  When video recording is enabled (`-Drecord.video=true`, off by default), the
  `videos/` directory is also uploaded on failure; with the flag off there are
  no videos to upload.
- **GitHub Pages / GitLab Pages** — publish the HTML for a hosted, linkable
  report with history/trends.

## Portable commands (any CI)

```bash
mvn -B clean test-compile                                   # fast validation, no browser
mvn -B compile exec:java -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install --with-deps"
mvn -B test -Dbrowser=chromium -Dheadless=true              # full run
mvn -B allure:report                                        # render report
```

See also: [REPORTING](REPORTING.md) · [CONFIGURATION](CONFIGURATION.md) · [CROSS_BROWSER](CROSS_BROWSER.md)
