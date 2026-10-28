# Getting Started

Install prerequisites, set up the environment, and run your first test.

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| JDK | 17+ | `java -version` |
| Maven | 3.9+ | `mvn -v` |

Playwright for Java downloads its own browser binaries — **no Node.js required**.

## 2. Configure Maven repository access

Dependencies resolve through your Maven mirror. If `mvn` reports `401`/`429`, set
credentials in `~/.m2/settings.xml` (the `<server>` id must match the `<mirror>`
id; store the password encrypted). See [CONFIGURATION](CONFIGURATION.md#maven-repository-access).

## 3. Verify the scaffold compiles (no browser needed)

```bash
mvn -B clean test-compile
```

A clean exit means the framework and dependencies are wired correctly. This does
not download browsers or hit the network.

## 4. Install Playwright browsers

One-time download of Chromium/Firefox/WebKit (and OS deps on Linux/CI):

```bash
mvn compile exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"
```

## 5. Run tests

```bash
# All tests, default browser (from config.properties)
mvn test

# Choose a browser at runtime
mvn test -Dbrowser=firefox
mvn test -Dbrowser=webkit

# Watch it run (headed)
mvn test -Dheadless=false

# Filter by tag
mvn test -Dgroups=smoke
mvn test -Dgroups=regression
```

> Tests target `https://www.saucedemo.com` by default (set in `config.properties`).
> Point at your own app with `-Dbase.url=...`.

## 6. View the report

```bash
mvn allure:serve      # renders and opens the Allure report
```

See [REPORTING](REPORTING.md) for details.

## Project at a glance

```
src/test/java/.../  config · driver · pages · utils · base · tests  (all code — no src/main)
src/test/resources/ config.properties · junit-platform.properties · allure.properties · log4j2.xml
```

## Troubleshooting first run

See [TROUBLESHOOTING](TROUBLESHOOTING.md) for the common issues (browser install,
timeouts, headless/headed, parallel state).
