# Documentation Index

Extensive documentation for the Playwright (Java) Web Automation Framework.
Start with the [project README](../README.md) for a quick overview, then dive in here.

## Guides

| Doc | What it covers |
|-----|----------------|
| [Getting Started](GETTING_STARTED.md) | Prerequisites, browser install, first run, verification |
| [Architecture](ARCHITECTURE.md) | Layers, component responsibilities, execution flow, threading model |
| [Writing Tests](WRITING_TESTS.md) | Page objects, locator strategy, tests, parameterised data, Allure steps |
| [Locators & Interactions](LOCATORS_AND_INTERACTIONS.md) | Every locator strategy + every UI interaction, with examples |
| [API Testing](API_TESTING.md) | HTTP tests via Playwright APIRequestContext (no browser) |
| [Advanced Features](ADVANCED_FEATURES.md) | Env profiles, retry, auth reuse, network mocking, logging, Spotless |
| [Configuration](CONFIGURATION.md) | Properties files, override precedence, launch/context options |
| [Cross-Browser](CROSS_BROWSER.md) | Chromium/Firefox/WebKit selection, parallel isolation, auth reuse |
| [Reporting](REPORTING.md) | Allure wiring, annotations, screenshots, trace & video |
| [CI/CD](CI_CD.md) | GitHub Actions, GitLab, Jenkins, Azure DevOps; browser install, matrix, caching |
| [CI Deployment](CI_DEPLOYMENT.md) | Step-by-step setup to deploy each CI platform |
| [Troubleshooting](TROUBLESHOOTING.md) | Common failures and fixes by stage |
| [Contributing](CONTRIBUTING.md) | Conventions, workflow, definition of done |

## Suggested reading order

### New to the project
1. [Getting Started](GETTING_STARTED.md)
2. [Architecture](ARCHITECTURE.md)
3. [Writing Tests](WRITING_TESTS.md)

### Writing or extending tests
1. [Writing Tests](WRITING_TESTS.md)
2. [Cross-Browser](CROSS_BROWSER.md)
3. [Configuration](CONFIGURATION.md)
4. [Reporting](REPORTING.md)

### Running in CI
1. [CI/CD](CI_CD.md)
2. [Reporting](REPORTING.md)
3. [Troubleshooting](TROUBLESHOOTING.md)

## Visual overview

A rendered architecture + project-structure diagram lives at
`../../playwright-framework-diagram.html` (open in a browser).

## Quick commands

```bash
mvn -B clean test-compile          # validate build (no browser)
mvn compile exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"
mvn test                           # run all tests
mvn test -Dbrowser=firefox         # pick a browser
mvn allure:serve                   # view the report
```
