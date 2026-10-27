# automation-parent

Shared Maven **parent POM** for the automation frameworks
([`appium-mobile-automation`](../appium-mobile-automation) and
[`playwright-automation`](../playwright-automation)).

It centralises what both frameworks have in common so they can't drift apart:

- **Properties** — Java 17 / UTF-8, and every dependency/plugin version in one place.
- **`dependencyManagement`** — versions for Allure, Log4j2, Jackson, AspectJ, plus
  each framework's stack (Appium/Selenium/TestNG/POI and Playwright/JUnit/AssertJ).
  Children declare dependencies **without** a `<version>`.
- **`pluginManagement`** — Surefire (AspectJ weaver `argLine` + Allure results dir),
  `allure-maven`, `exec-maven-plugin`, and Spotless (Google Java Format, AOSP).
  Children just **enable** these plugins; version and shared config are inherited.

## How children use it

```xml
<parent>
    <groupId>com.company.automation</groupId>
    <artifactId>automation-parent</artifactId>
    <version>1.0.0</version>
    <relativePath>../automation-parent/pom.xml</relativePath>
</parent>
```

Each child then lists only the dependencies it uses (no versions) and any
framework-specific plugin config — e.g. Appium adds the TestNG `suiteXmlFiles`,
Playwright adds Surefire `excludedGroups` and the browser-install exec plugin.

## Building

The parent must be available to the children. For local/relative builds the
`relativePath` is enough, but installing it once is the robust option:

```bash
# From this directory
mvn install        # publishes automation-parent:1.0.0 to your local ~/.m2

# Then the frameworks build as usual
cd ../appium-mobile-automation && mvn clean test-compile
cd ../playwright-automation   && mvn clean test-compile
```

In CI, install the parent (or include it in the reactor) before building a child.

## Changing a version

Bump the property here (e.g. `<allure.version>`), reinstall the parent, and both
frameworks pick it up — no per-project edits. Dependabot PRs that touch versions
should target this POM.

## Scope (Option 1)

This is a **parent POM only** — it unifies versions and plugin wiring but the two
frameworks remain independent projects with their own source. It deliberately does
**not** extract shared Java classes (`ConfigReader`, `Secrets`, `RunMetadata`,
`TestDataFactory`) into a common module; that would be a larger "aggregator +
automation-commons" change.
