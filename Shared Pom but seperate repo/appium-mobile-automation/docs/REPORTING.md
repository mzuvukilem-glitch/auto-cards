# Reporting (Allure)

Allure is the framework's reporting tool. It turns raw result files into a rich
HTML report with steps, screenshots, severity, and environment metadata.

## How it's wired

| Piece | Location | Purpose |
|-------|----------|---------|
| `allure-testng` dependency | `pom.xml` | TestNG → Allure integration |
| AspectJ weaver | `pom.xml` (Surefire `argLine`) | makes `@Step`/`@Attachment` work |
| `allure-maven` plugin | `pom.xml` | `mvn allure:report` / `allure:serve` |
| `allure.results.directory` | Surefire `systemPropertyVariables` | where raw results go (`target/allure-results`) |
| `allure.properties` | `src/test/resources` | results dir + Issue/TMS link patterns |
| `TestListener` | `listeners/` | attaches screenshots on failure |
| `AllureEnvironmentWriter` | `utils/` | writes the Environment widget data |

## Generating the report

```bash
# Option A — Maven plugin (no separate CLI install)
mvn test                 # produces target/allure-results
mvn allure:report        # renders HTML to target/site/allure-maven-plugin
mvn allure:serve         # renders + opens in a browser on a temp port

# Option B — standalone Allure CLI (npm i -g allure-commandline)
allure serve target/allure-results
allure generate target/allure-results --clean -o target/allure-report
```

## Annotations you can use in tests and pages

```java
@Description("Valid credentials land the user on Home")   // test intent
@Severity(SeverityLevel.BLOCKER)                           // BLOCKER..TRIVIAL
@Step("Log in as '{username}'")                            // page method → report step
@Link(name = "Spec", url = "https://...")                  // arbitrary link
@Issue("MOB-123")                                          // uses allure.link.issue.pattern
@TmsLink("TC-456")                                         // uses allure.link.tms.pattern
```

`@Step` placeholders (`{username}`) are filled from the method arguments.

## Screenshots on failure

`TestListener.onTestFailure` captures a screenshot and attaches it to the Allure
report, and also saves a copy to `screenshots/` on disk:

```java
byte[] screenshot = ScreenshotUtils.captureAsBytes();
Allure.addAttachment("Failure screenshot", new ByteArrayInputStream(screenshot));
ScreenshotUtils.captureToFile(result.getMethod().getMethodName());
```

To attach a screenshot at an arbitrary point in a test, call
`ScreenshotUtils.captureAsBytes()` and `Allure.addAttachment(...)` yourself.

## Environment widget

`AllureEnvironmentWriter.write()` (called from `BaseTest.@BeforeSuite`) emits
`environment.properties` into the results directory:

```
Platform=android
Appium.Server.URL=http://127.0.0.1:4723
Environment=qa
OS=Windows 11 10.0
Java.Version=17.0.10
```

These appear in the report's **Environment** widget. Add more keys by extending
`AllureEnvironmentWriter`.

## Clickable Issue / TMS links

`allure.properties` defines the URL templates; `{}` is replaced by the id you pass
to `@Issue` / `@TmsLink`:

```properties
allure.link.issue.pattern=https://jira.example.com/browse/{}
allure.link.tms.pattern=https://tms.example.com/testcase/{}
```

## Categories, history and trends (optional)

- **Categories** — add `src/test/resources/categories.json` to classify failures
  (e.g. "Product defects" vs "Test defects"); copy it into results before
  generating.
- **History/trends** — copy the previous report's `history/` folder into the new
  `allure-results/` before generating so trend graphs persist across runs. CI
  tools (Jenkins Allure plugin) do this automatically.

## In CI

The Jenkins pipeline publishes the report via the Allure Jenkins plugin:

```groovy
allure includeProperties: false, results: [[path: 'allure-results']]
```

See [CI_CD](CI_CD.md) for the full pipeline.

See also: [WRITING_TESTS](WRITING_TESTS.md) · [TROUBLESHOOTING](TROUBLESHOOTING.md)
