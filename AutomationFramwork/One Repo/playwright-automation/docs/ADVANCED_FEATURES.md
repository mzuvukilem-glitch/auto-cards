# Advanced Features

Capabilities beyond the core page-object/driver model.

## Environment profiles

Run the same build against multiple environments with a classpath overlay file
selected by `-Denvironment=`:

```
src/test/resources/
├── config.properties            # base (always loaded)
├── config.int.properties        # overlay for -Denvironment=int
├── config.qa.properties         # overlay for -Denvironment=qa
├── config.staging.properties    # overlay for -Denvironment=staging
└── config.stress.properties     # overlay for -Denvironment=stress
```

Precedence (highest first): `-Dkey=value` → `config.<env>.properties` →
`config.properties` → code default.

```bash
mvn test -Denvironment=int
mvn test -Denvironment=qa
mvn test -Denvironment=stress -Dbrowser=firefox
```

Supported environments: `int`, `qa`, `staging`, `stress`. If `-Denvironment` is
set to a value with no matching `config.<env>.properties` on the classpath, the
build **fails fast** with a clear message (so a typo never silently runs against
the base target). Add a new environment by dropping a `config.<name>.properties`.

## Retry for flaky tests

JUnit 5 has no built-in retry, so the framework provides `@Retry(n)` (a
`TestTemplate` + `RetryExtension`). A test is re-run up to `n` times and reported
green if any attempt passes. Use sparingly — retries hide flakiness; prefer a fix.

```java
@Retry(3)
void mayBeFlaky() { ... }
```

(Playwright's own `retries` can also be set in config for the whole run.)

## Auth-state reuse (storageState)

Log in once, reuse the session across tests to skip the login UI — a big speed-up
for authenticated suites.

```java
// one-time setup: after a UI login
AuthState.save(context);
```

Then enable reuse so new contexts start signed in:

```bash
mvn test -Dreuse.auth=true
```

`PlaywrightFactory` loads `storage-state/auth.json` into the context when
`reuse.auth=true` and the file exists. The state file is git-ignored.

## Network mocking / interception

Stub backend responses with `page.route(...)` for deterministic UI tests and
edge-case coverage. See `NetworkMockingExampleTest`:

```java
page.route("**/api/products", route ->
    route.fulfill(new Route.FulfillOptions()
        .setStatus(200).setContentType("application/json")
        .setBody("{\"products\":[{\"id\":1,\"name\":\"Mocked Item\"}]}")));

page.route("**/*.{png,jpg,jpeg}", route -> route.abort());  // block images to speed up
```

## Logging

Log4j2 is wired through the driver and page layers:
- `PlaywrightFactory` logs launch/ready/close.
- `BasePage` logs `click`/`fill` at `debug`.
- Output goes to the console and `logs/automation.log` (see `log4j2.xml`).

## Code style (Spotless)

Enforced formatting via the Spotless Maven plugin (Google Java Format, AOSP):

```bash
mvn spotless:check     # verify (use in CI)
mvn spotless:apply     # auto-format
```

A `.editorconfig` keeps editors consistent (UTF-8, LF, 4-space Java).

## Pre-commit verification

The repo ships a Kiro hook (`.kiro/hooks/pre-commit-verify.json`) that runs
`mvn test-compile` on both frameworks before a `git commit` and blocks the commit
if either fails to compile.

See also: [CONFIGURATION](CONFIGURATION.md) · [CROSS_BROWSER](CROSS_BROWSER.md) · [API_TESTING](API_TESTING.md)

## Robustness features

### Config validation (fail fast)

`ConfigReader` validates configuration when it loads — a missing/malformed
`base.url` or an invalid `browser` value throws immediately with a clear message,
instead of surfacing a confusing failure mid-test.

### Secrets (no credentials in the repo)

`Secrets` resolves credentials with this precedence: `-Dkey=...` → environment
variable (`KEY` or `UPPER_SNAKE`) → git-ignored `.env`. The API bearer token
(`api.token`) goes through this. Copy `.env.example` to `.env` locally; never
commit `.env`.

### Typed test data

`TestDataFactory.loadList("testdata/loginData.json", LoginData.class)` reads JSON
into typed records. See `DataDrivenLoginTest` (`@MethodSource`).

### Correlation IDs + run metadata

Each test thread gets a `testId` in the Log4j2 `ThreadContext`, printed as
`[%X{testId}]` in every log line. The Allure Environment widget records git SHA /
branch / build number / CI flag from CI env vars (`RunMetadata`).

### Flaky-test quarantine

Tag a known-flaky test `@Tag("quarantine")`. Surefire excludes it from the gate
run (`excludedGroups=quarantine`); run quarantined tests deliberately with
`mvn test -Dgroups=quarantine -DexcludedGroups=`.

### Soft assertions (AssertJ)

JUnit 5 has no built-in soft assertions, so AssertJ provides them — collect every
failure, then `assertAll()`. See `SoftAssertExampleTest`.

### Accessibility (axe-core)

`Accessibility.violationCount(page)` injects axe-core and runs it; assert against
a budget. See `AccessibilityExampleTest` (`@Tag("a11y")`, run with
`mvn test -Dgroups=a11y -DexcludedGroups=`).

### Dependency hygiene

`.github/dependabot.yml` opens weekly PRs for Maven and GitHub Actions updates,
grouping minor/patch bumps.
