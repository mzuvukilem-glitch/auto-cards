# Contributing

Conventions and workflow for extending the framework.

## Workflow

1. Create a branch off the default branch.
2. Make the change with a test (new `*Tests` class or added `@Test`).
3. Verify locally: `mvn -B clean test-compile` (and `mvn test` if browsers are installed).
4. Open a pull/merge request; keep it focused.

## Coding conventions

- **Java 17**, standard formatting; small single-purpose classes.
- **Package layout** mirrors responsibility, all under `src/test`: `config`,
  `driver`, `pages`, `utils` (framework/support) alongside `base`, `tests`.
- **Page objects** expose actions, not locators. Declare `Locator` fields in the
  constructor; return the next page object from navigation actions.
- **Tests assert; pages act.** Never assert inside a page object.
- **No hard-coded config.** Add values to `config.properties` and read them via
  `ConfigReader`.
- **Tag every test** `@Tag("smoke")` or `@Tag("regression")`, and give it a
  `@DisplayName`.
- **Annotate for Allure**: `@Description`/`@Severity` on tests, `@Step` on page
  methods.
- **No `Thread.sleep`.** Rely on Playwright auto-waiting; adjust timeouts in config.

## Locator guidance

Prefer, in order: `getByRole` → `getByTestId` (`data-test`) →
`getByLabel`/`getByPlaceholder`/`getByText` → CSS id → XPath (last resort).
Keep each locator unique to avoid strict-mode violations.

## Adding a screen

See [WRITING_TESTS](WRITING_TESTS.md#1-add-a-page-object). Extend `BasePage`,
declare locators, add `@Step` methods, and reference it from tests.

## Adding config or browser options

See [CONFIGURATION](CONFIGURATION.md). Add keys to `config.properties` and read
them in `ConfigReader`; set launch/context options in `PlaywrightFactory`.

## Adding cross-cutting behaviour

Write a JUnit 5 extension (like `ScreenshotOnFailure`) and register it with
`@ExtendWith` on `BaseTest`.

## Commit messages

Concise, imperative (e.g. "Add AccountPage and logout test"). Reference the
tracker id so Allure `@Issue`/`@TmsLink` and history line up.

## Definition of done

- Compiles: `mvn -B clean test-compile` passes.
- New behaviour covered by at least one test.
- Docs updated if structure, config, or conventions changed.
- No secrets committed (credentials, tokens, auth state files).

See also: [ARCHITECTURE](ARCHITECTURE.md)
