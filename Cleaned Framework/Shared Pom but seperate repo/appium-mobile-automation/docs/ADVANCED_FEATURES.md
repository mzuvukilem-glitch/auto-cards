# Advanced Features

Capabilities beyond the core page-object/driver model.

## Environment profiles

Run the same build against multiple environments with an overlay file selected by
`-Denvironment=`:

```
src/test/resources/config/
├── config.properties            # base (always loaded)
├── config.qa.properties         # overlay for -Denvironment=qa
└── config.staging.properties    # overlay for -Denvironment=staging
```

Precedence (highest first): `-Dkey=value` → `config.<env>.properties` →
`config.properties` → code default.

```bash
mvn test -Denvironment=qa
mvn test -Denvironment=staging -Dplatform=ios
```

Add a new environment by dropping a `config.<name>.properties` file and selecting
it with `-Denvironment=<name>`.

## Local Appium server auto-start

`AppiumServerManager` can start/stop a local Appium server for the whole run,
wired into `BaseTest` and gated by a flag (default off, so external servers are
unaffected):

```bash
mvn test -Dappium.server.autostart=true
```

When enabled, the server is bound to the host and port parsed from
`appium.server.url`, so it starts exactly where `DriverFactory` connects — set
that URL (e.g. `-Dappium.server.url=http://127.0.0.1:4724`) to move both together.

## Device-cloud profiles (BrowserStack / Sauce Labs)

`CapabilitiesBuilder` applies vendor capabilities when `device.farm` is set and
**auto-derives the hub URL**, so a cloud run is just the farm flag plus
credentials (no separate URL to remember). Credentials come from config/`-D`
(via `Secrets`) — never hard-code them.

```bash
mvn test -Dplatform=android \
  -Ddevice.farm=browserstack \
  -Dcloud.user=$BSTACK_USER -Dcloud.key=$BSTACK_KEY
```

Supported values: `local` (default), `browserstack`, `saucelabs`, `lambdatest`,
`awsdevicefarm`, `perfecto`. Pass a vendor-uploaded app with
`-Dcloud.app=bs://… | storage:… | lt://…` (otherwise the local `appFile` is
used); an explicit `-Dappium.server.url` always overrides the derived hub (AWS
Device Farm requires it — the signed grid URL). Full per-provider guide:
[DEVICE_SETUP](DEVICE_SETUP.md). Extend `applyDeviceFarm(...)` + `resolveServerUrl(...)`
for other vendors.

## Soft assertions

Collect multiple checks and report all failures together (TestNG `SoftAssert`),
instead of stopping at the first. See `SoftAssertExampleTest`:

```java
SoftAssert soft = new SoftAssert();
soft.assertTrue(home.isLoaded(), "Home loaded");
soft.assertFalse(home.getWelcomeText().isBlank(), "Welcome present");
soft.assertAll();   // reports every failure collected above
```

## Logging

Log4j2 is wired through the driver and page layers:
- `DriverFactory` logs session init/quit.
- `BasePage` logs `tap`/`type` at `debug`.
- Output goes to the console and `logs/automation.log` (see `log4j2.xml`).

Raise the `com.company.automation` logger to `debug` for full action traces.

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

See also: [CONFIGURATION](CONFIGURATION.md) · [CI_CD](CI_CD.md) · [WRITING_TESTS](WRITING_TESTS.md)

## Robustness features

### Config validation (fail fast)

`ConfigReader` validates configuration when it loads — a missing or malformed
`appium.server.url` throws immediately with a clear message, instead of surfacing
a confusing failure mid-test.

### Secrets (no credentials in the repo)

`Secrets` resolves credentials with this precedence: `-Dkey=...` → environment
variable (`KEY` or `UPPER_SNAKE`) → git-ignored `.env`. Mandatory secrets use
`Secrets.require(key)`, which fails fast naming the key and how to supply it.
Device-cloud keys (`cloud.user`/`cloud.key`) go through this. Copy `.env.example`
to `.env` locally; never commit `.env`.

### Typed test data

`TestDataFactory.loadList("loginData.json", UserData.class)` reads JSON into typed
records, so tests use `data.username()` not `map.get("username")`. The same
extension-based API also reads CSV — pass `"loginData.csv"` and it parses the CSV
(header row matching the record field names) into the same typed records. See
`DataDrivenLoginTest`.

### Correlation IDs + run metadata

Each test thread gets a `testId` in the Log4j2 `ThreadContext`, printed as
`[%X{testId}]` in every log line so parallel runs are untangle-able. The Allure
Environment widget also records git SHA / branch / build number / CI flag from CI
env vars (`RunMetadata`).

### Flaky-test quarantine

Tag a known-flaky test `@Test(groups = {"quarantine"})`. The gate suite
(`testng.xml`) excludes that group; run quarantined tests deliberately with
`mvn test -DsuiteXmlFile=quarantine.xml`.

### App lifecycle helpers

`AppLifecycle` wraps portable `mobile:` commands: `background`, `terminate`,
`activate`, `install`, `remove`, `isInstalled`, `reset`, and `deepLink` — pass the
app's package/bundle id.

### Dependency hygiene

`.github/dependabot.yml` opens weekly PRs for Maven and GitHub Actions updates,
grouping minor/patch bumps.
