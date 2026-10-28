# Advanced Features

Capabilities beyond the core page-object/driver model.

## Environment profiles

Run the same build against multiple environments with an overlay file selected by
`-Denvironment=`:

```
src/test/resources/config/
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
mvn test -Denvironment=stress -Dplatform=ios
```

Supported environments: `int`, `qa`, `staging`, `stress`. If `-Denvironment` is
set to a value with no matching `config.<env>.properties` file, the build **fails
fast** with a clear message (so a typo never silently runs against the base
target). Add a new environment by dropping a `config.<name>.properties` file.

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
records, so tests use `data.username()` not `map.get("username")`. The same API
also reads CSV — pass a `.csv` file (e.g. `loginData.csv`) and the loader picks
the format by file extension, parsing into the same records (CSV needs a header
row matching the field names). See `DataDrivenLoginTest`.

### Environment-specific test data

`TestDataFactory` is environment-aware. When `-Denvironment=<env>` is set, it
prefers an environment-specific data file in a sibling sub-folder and falls back
to the base file if none exists — mirroring the `config.<env>.properties` overlay
model. The environment comes from the same `-Denvironment` system property that
drives config overlays. This works for both JSON and CSV, and call sites are
unchanged (same `loadList(...)`/`load(...)` calls).

Lookup order for a requested `loginData.json` (filesystem):

- `src/test/resources/testdata/<env>/loginData.json` if present
- else `src/test/resources/testdata/loginData.json`

For example, `mvn test -Denvironment=staging` picks up
`src/test/resources/testdata/staging/loginData.json` (a worked example ships in
the repo), falling back to `src/test/resources/testdata/loginData.json` when no
override exists.

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
