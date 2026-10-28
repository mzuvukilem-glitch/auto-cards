# Reporting (Allure)

Allure turns raw results into a rich HTML report with steps, screenshots,
severity, and metadata. Playwright's own trace complements it for
deep debugging.

## How it's wired

| Piece | Location | Purpose |
|-------|----------|---------|
| `allure-junit5` dependency | `pom.xml` | JUnit 5 → Allure integration |
| AspectJ weaver | `pom.xml` (Surefire `argLine`) | makes `@Step` work |
| `allure-maven` plugin | `pom.xml` | `mvn allure:report` / `allure:serve` |
| `allure.results.directory` | Surefire `systemPropertyVariables` | results go to `target/allure-results` |
| `allure.properties` | `src/test/resources` | results dir + Issue/TMS link patterns |
| `ScreenshotOnFailure` | `base/` | attaches a screenshot on failure |

## Generating the report

```bash
mvn test                 # produces target/allure-results
mvn allure:serve         # renders + opens in a browser on a temp port
mvn allure:report        # renders HTML to target/site/allure-maven-plugin
```

Or with the standalone CLI (`npm i -g allure-commandline`):

```bash
allure serve target/allure-results
```

## Annotations

```java
@DisplayName("Valid credentials land on inventory")   // JUnit 5 readable name
@Description("A standard user can log in")             // Allure description
@Severity(SeverityLevel.BLOCKER)                       // BLOCKER..TRIVIAL
@Step("Log in as '{0}'")                               // page method → report step ({0} = first arg)
@Issue("WEB-123")                                      // uses allure.link.issue.pattern
@TmsLink("TC-456")                                     // uses allure.link.tms.pattern
```

`@Tag("smoke")` / `@Tag("regression")` double as filters (`-Dgroups=smoke`) and
show up as report labels.

## Screenshots on failure

`ScreenshotOnFailure` is a JUnit 5 `TestWatcher` registered on `BaseTest` via
`@ExtendWith`. On `testFailed` it captures a full-page screenshot and attaches it:

```java
byte[] png = ScreenshotUtils.capture(page);
Allure.addAttachment("Failure - " + displayName, new ByteArrayInputStream(png));
```

Because teardown (`@AfterEach`) runs after the watcher, the page is still alive
when the screenshot is taken.

To attach at an arbitrary point in a test, call `ScreenshotUtils.capture(page)`
and `Allure.addAttachment(...)` yourself.

## Playwright trace

Configured independently of Allure for deep debugging:

- **Trace** — enable in `PlaywrightFactory` around a test
  (`context.tracing().start(...) / stop(...)`), then open the zip:

```bash
# via the Playwright CLI
mvn exec:java -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="show-trace trace.zip"
```

The trace viewer shows a DOM snapshot, network, console, and a timeline per
action — the fastest way to diagnose a flaky step.

- **Video** — recorded per browser context, **off by default**. When
  `record.video=true`, `PlaywrightFactory` calls
  `setRecordVideoDir(Paths.get("videos"))` on the context options and Playwright
  writes a video (via its bundled ffmpeg) to the `videos/` directory. Enable it
  for a run with:

```bash
mvn test -Drecord.video=true
```

  Keeping it off (the default) lets the suite run in offline/locked-down
  environments where ffmpeg isn't available. Trace and screenshots are separate
  and always available.

## Attaching extra context

```java
Allure.addAttachment("API response", "application/json", json);
Allure.parameter("browser", ConfigReader.get("browser"));
```

## In CI

The GitHub Actions workflow runs `mvn allure:report` and uploads both
`allure-results` and the HTML report as artifacts. When video recording is
enabled (`-Drecord.video=true`), the `videos/` directory is uploaded as a
failure artifact too. See [CI_CD](CI_CD.md).

See also: [WRITING_TESTS](WRITING_TESTS.md) · [TROUBLESHOOTING](TROUBLESHOOTING.md)
