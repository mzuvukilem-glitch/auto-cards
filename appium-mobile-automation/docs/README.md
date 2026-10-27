# Documentation Index

Extensive documentation for the Appium Mobile Automation Framework.
Start with the [project README](../README.md) for a quick overview, then dive in here.

## Guides

| Doc | What it covers |
|-----|----------------|
| [Getting Started](GETTING_STARTED.md) | Prerequisites, environment setup, first run, verification |
| [Architecture](ARCHITECTURE.md) | Layers, component responsibilities, execution flow, threading model |
| [Writing Tests](WRITING_TESTS.md) | Page objects, platform locators, tests, `@DataProvider`, Allure steps |
| [Locators & Interactions](LOCATORS_AND_INTERACTIONS.md) | Every locator strategy + every UI interaction, with examples |
| [Configuration](CONFIGURATION.md) | Properties files, capabilities, override precedence, environments |
| [Cross-Platform](CROSS_PLATFORM.md) | Android/iOS locator strategy, platform selection, parallel runs |
| [Reporting](REPORTING.md) | Allure wiring, annotations, screenshots, environment widget |
| [CI/CD](CI_CD.md) | GitHub Actions, GitLab, Jenkins, Azure DevOps; Docker, device clouds, caching |
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
2. [Cross-Platform](CROSS_PLATFORM.md)
3. [Configuration](CONFIGURATION.md)
4. [Reporting](REPORTING.md)

### Running in CI
1. [CI/CD](CI_CD.md)
2. [Reporting](REPORTING.md)
3. [Troubleshooting](TROUBLESHOOTING.md)

## Visual overview

A rendered architecture + project-structure diagram lives at
`../../appium-framework-diagram.html` (open in a browser).

## Quick commands

```bash
mvn -B clean test-compile          # validate build (no device)
mvn clean test                     # run full suite (Android + iOS)
mvn test -Dplatform=android        # single platform
mvn allure:serve                   # view the report
```
