# Automation Monorepo (reactor)

A Maven reactor that builds the shared modules and both automation frameworks in
dependency order.

> Note: `pom.xml` at the workspace root is an **aggregator only** — it lists the
> modules below and builds nothing else in this directory.

## Modules

| Module | Type | Role |
|--------|------|------|
| [`automation-parent`](automation-parent) | pom | Shared versions (`dependencyManagement`) + plugin wiring (`pluginManagement`) |
| [`automation-commons`](automation-commons) | jar | Framework-agnostic shared code: `Secrets`, `RunMetadata`, `JsonUtils` |
| [`appium-mobile-automation`](appium-mobile-automation) | jar | Appium + TestNG mobile UI framework |
| [`playwright-automation`](playwright-automation) | jar | Playwright + JUnit 5 web UI + API framework |

Build order resolved by the reactor: parent → commons → appium → playwright.

## Build everything

```bash
# From the workspace root
mvn -f pom.xml clean install            # builds all modules in order
mvn -f pom.xml clean package -DskipTests
mvn -f pom.xml clean test-compile       # fast validation, no device/browser
```

## Build a single framework

Each framework still builds on its own, but its dependencies
(`automation-parent`, `automation-commons`) must be in the local repo first:

```bash
mvn -f automation-parent/pom.xml install
mvn -f automation-commons/pom.xml install
cd appium-mobile-automation && mvn clean test-compile
```

The reactor (`mvn -f pom.xml install`) does this ordering for you.

## Code style (Spotless)

Spotless is configured in the parent and applied in each module. Run it
**per module** (the aggregator pom carries no plugin prefix of its own):

```bash
cd automation-commons && mvn spotless:apply   # or spotless:check
```

## What's shared vs per-framework

- **Shared (in `automation-commons`):** `Secrets`, `RunMetadata`, `JsonUtils`.
- **Per-framework (intentionally not shared):** `ConfigReader`, `TestDataFactory`,
  `AllureEnvironmentWriter` — their behaviour differs (filesystem vs classpath
  config, different keys/fields). See
  [`automation-commons/README.md`](automation-commons/README.md) for the rationale.
