# Appium Mobile Automation Framework

<!-- CI badges — replace the placeholder owner/repo and host URLs with your own. -->
[![GitHub Actions](https://github.com/OWNER/appium-mobile-automation/actions/workflows/appium-tests.yml/badge.svg)](https://github.com/OWNER/appium-mobile-automation/actions/workflows/appium-tests.yml)
[![GitLab pipeline](https://gitlab.example.com/GROUP/appium-mobile-automation/badges/main/pipeline.svg)](https://gitlab.example.com/GROUP/appium-mobile-automation/-/pipelines)
[![Azure DevOps](https://dev.azure.com/ORG/PROJECT/_apis/build/status/appium-mobile-automation?branchName=main)](https://dev.azure.com/ORG/PROJECT/_build/latest?definitionId=ID&branchName=main)
[![Jenkins](https://img.shields.io/badge/Jenkins-pipeline-blue?logo=jenkins)](https://jenkins.example.com/job/appium-mobile-automation/)

Appium + TestNG + Maven mobile UI automation framework using the Page Object Model (POM),
with thread-safe parallel execution, externalised config/test data, Log4j2 logging,
Allure reporting, and CI integration.

## CI

Ready-to-use pipelines for four CI platforms. They run the same Maven commands;
only the wrapper differs. Mobile tests need a device/emulator — see
[docs/CI_CD.md](docs/CI_CD.md) for provisioning and per-platform detail, and
[docs/CI_DEPLOYMENT.md](docs/CI_DEPLOYMENT.md) for step-by-step setup on each platform.

| Platform | Config file |
|----------|-------------|
| GitHub Actions | [`.github/workflows/appium-tests.yml`](.github/workflows/appium-tests.yml) |
| GitLab CI | [`.gitlab-ci.yml`](.gitlab-ci.yml) |
| Jenkins | [`ci/Jenkinsfile`](ci/Jenkinsfile) |
| Azure DevOps | [`azure-pipelines.yml`](azure-pipelines.yml) |

> The badges above use placeholder URLs (`OWNER`, `GROUP`, `ORG/PROJECT`, host
> names). Replace them with your repository's real coordinates to make them live.

## Documentation

Full documentation lives in [`docs/`](docs/README.md):

- [Getting Started](docs/GETTING_STARTED.md) — setup and first run
- [Architecture](docs/ARCHITECTURE.md) — components, flow, threading
- [Writing Tests](docs/WRITING_TESTS.md) — pages, locators, data providers
- [Configuration](docs/CONFIGURATION.md) — properties, capabilities, overrides
- [Cross-Platform](docs/CROSS_PLATFORM.md) — Android + iOS locator strategy
- [Reporting](docs/REPORTING.md) — Allure setup and usage
- [CI/CD](docs/CI_CD.md) — Jenkins, Docker, device clouds
- [Troubleshooting](docs/TROUBLESHOOTING.md) — common failures and fixes
- [Contributing](docs/CONTRIBUTING.md) — conventions and workflow

## Tech stack

| Concern            | Choice                          |
|--------------------|---------------------------------|
| Language           | Java 17                         |
| Build              | Maven                           |
| Test runner        | TestNG                          |
| Mobile automation  | Appium (java-client)            |
| Reporting          | Allure + TestNG default reports |
| Logging            | Log4j2                          |
| Data               | JSON or CSV (Jackson) / Excel (POI) |

## Project layout

```
appium-mobile-automation/
├── pom.xml                  # dependencies + build
├── testng.xml               # suite definition
├── src/test/java/...        # framework + tests together (driver, config, pages,
│                            #   utils, data, constants, base, tests, listeners) — no src/main
└── src/test/resources/...   # config, testdata, apps, logging
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
uses (no `<version>`) plus the Appium-specific TestNG suite file.

## Prerequisites

- JDK 17+
- Maven 3.9+
- Node.js + Appium 2.x (`npm i -g appium`)
- Appium drivers: `appium driver install uiautomator2` (Android), `appium driver install xcuitest` (iOS)
- Android SDK / Xcode for the target platform
- A running emulator/simulator or connected device

## Running

Start the Appium server (or pass `-Dappium.server.autostart=true` to let
`AppiumServerManager` start one, bound to `appium.server.url`), then:

```bash
# Run the default suite
mvn clean test

# Run a specific suite file
mvn clean test -DsuiteXmlFile=testng.xml

# Override platform at runtime
mvn clean test -Dplatform=android
```

## Reports (Allure)

Allure is the reporting framework. During a run, raw result files are written to
`target/allure-results` (configured via Surefire `allure.results.directory` and
`src/test/resources/allure.properties`). Tests are annotated with `@Description`,
`@Severity` and `@Step`, failure screenshots are attached automatically by
`TestListener`, and run metadata (platform, device, OS, Java) appears in the report's
Environment widget via `AllureEnvironmentWriter`.

Generate and view the report:

```bash
# Option A — via the Maven plugin (no separate CLI install needed)
mvn test                 # produces target/allure-results
mvn allure:report        # renders HTML to target/site/allure-maven-plugin
mvn allure:serve         # renders + opens in a browser on a temp port

# Option B — via the standalone Allure CLI (npm i -g allure-commandline)
allure serve target/allure-results
allure generate target/allure-results --clean -o target/allure-report
```

What you get in the report:
- Test steps mirror the Page Object calls (`@Step` on page methods)
- Screenshots attached on failure
- Severity and description per test
- Environment widget (platform, Appium URL, OS, Java version)
- Optional clickable Issue/TMS links (patterns in `allure.properties`)

## Configuration

Platform, device, app path and server URL live in
`src/test/resources/config/config.properties` (plus `android.properties` / `ios.properties`).
Nothing is hard-coded in test classes.

## Cross-platform support (Android + iOS)

A single set of Page Objects drives both platforms. Each element declares an
Android locator and an iOS locator; `PlatformLocator` resolves the correct one
at runtime based on the active driver (tracked per-thread in `DriverManager`).

```java
private final PlatformLocator loginButton = PlatformLocator.of(
        AppiumBy.id("com.example.app:id/btnLogin"),   // Android (resource-id)
        AppiumBy.accessibilityId("login-button"));    // iOS (accessibility id)
```

Prefer `AppiumBy.accessibilityId(...)` where possible — it maps to Android
`content-desc` and iOS `accessibility identifier`, so one locator often covers both.

How platform is selected:
- `DriverFactory.initDriver(platform)` builds an `AndroidDriver` (UiAutomator2) or
  `IOSDriver` (XCUITest) and records the `Platform` on the current thread.
- Capabilities come from `android.properties` / `ios.properties` via `CapabilitiesBuilder`.
- `testng.xml` runs Android and iOS `<test>` blocks; with `parallel="tests"` they can
  execute concurrently, each thread owning its own driver.

Run a single platform:

```bash
mvn test -Dplatform=android
mvn test -Dplatform=ios
```

## Maven settings (artifact repository access)

Dependencies are pulled through a Maven repository manager (e.g. a corporate Nexus mirror).
If you see `401 Unauthorized` or `429 Too many authentication attempts` on `mvn` commands,
your `~/.m2/settings.xml` is missing credentials for the mirror, or the password is wrong.

Maven reads credentials from `~/.m2/settings.xml` (`%USERPROFILE%\.m2\settings.xml` on Windows).
The `<server>` `id` must match the `<mirror>`/`<repository>` `id`:

```xml
<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0">
  <servers>
    <server>
      <id>nexus</id>
      <username>YOUR_USERNAME</username>
      <password>{ENCRYPTED_OR_PLAIN_PASSWORD}</password>
    </server>
  </servers>

  <mirrors>
    <mirror>
      <id>nexus</id>
      <mirrorOf>*</mirrorOf>
      <name>Corporate Nexus</name>
      <url>https://your-nexus-host/repo/content/groups/public/</url>
    </mirror>
  </mirrors>

  <profiles>
    <profile>
      <id>nexus</id>
      <repositories>
        <repository>
          <id>central</id>
          <url>https://your-nexus-host/repo/content/groups/public/</url>
          <releases><enabled>true</enabled></releases>
          <snapshots><enabled>true</enabled></snapshots>
        </repository>
      </repositories>
    </profile>
  </profiles>

  <activeProfiles>
    <activeProfile>nexus</activeProfile>
  </activeProfiles>
</settings>
```

### Do not store passwords in plain text

Encrypt the password instead of committing it in cleartext:

```bash
# 1. Create a master password -> ~/.m2/settings-security.xml
mvn --encrypt-master-password

# 2. Encrypt your Nexus password; paste the {...} output into <password> above
mvn --encrypt-password
```

See the Maven guide: https://maven.apache.org/guides/mini/guide-encryption.html

### Verifying the build

```bash
# Resolve dependencies and compile main + test sources (no device needed)
mvn -B clean test-compile

# 429 errors are rate-limiting from the mirror. Wait a moment, then retry.
```

A successful `test-compile` means the framework is wired correctly; running the actual
tests additionally requires a running Appium server and an emulator/simulator or device.
