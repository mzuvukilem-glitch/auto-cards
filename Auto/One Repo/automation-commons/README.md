# automation-commons

Framework-agnostic shared code used by both the Appium and Playwright frameworks,
so the genuinely identical utilities live in exactly one place.

Package: `com.company.automation.commons`

| Class | Purpose |
|-------|---------|
| `Secrets` | Resolve secrets: `-D` → env var (`KEY`/`UPPER_SNAKE`) → git-ignored `.env`; `require()` fails fast |
| `RunMetadata` | Git SHA / branch / build number / CI flag from CI env vars, for the Allure Environment widget |
| `JsonUtils` | Jackson helpers: `toJson`, `parse`, `fromJson` |

## Using it

Inherits versions/plugins from [`automation-parent`](../automation-parent) and is
consumed by the frameworks as a normal dependency:

```xml
<dependency>
    <groupId>com.company.automation</groupId>
    <artifactId>automation-commons</artifactId>
    <version>1.0.0</version>
</dependency>
```

Build the reactor from the workspace root (`mvn -f pom.xml install`) so commons is
built before the frameworks that depend on it.

## Scope

Only truly framework-agnostic, identical code lives here. Classes whose behaviour
differs per framework stay in each framework:

- **`ConfigReader`** — Appium loads config from the filesystem (`src/test/resources/config/`),
  Playwright from the classpath; keys validated differ.
- **`TestDataFactory`** — Appium reads from a filesystem path, Playwright from the classpath.
- **`AllureEnvironmentWriter`** — different fields (platform/server vs browser/base URL).

Forcing those into one class would require invasive, risky rewrites of
framework-specific code (e.g. Appium's `CapabilitiesBuilder`/`FrameworkConstants`),
so they are intentionally left per-framework. They all delegate to `RunMetadata`
here for the shared run-metadata portion.
