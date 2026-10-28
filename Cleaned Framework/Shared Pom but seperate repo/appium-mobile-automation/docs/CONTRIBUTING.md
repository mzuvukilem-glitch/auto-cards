# Contributing

Conventions and workflow for extending the framework.

## Workflow

1. Create a branch off the default branch.
2. Make the change with a test (new `*Tests` class or added `@Test`).
3. Verify locally: `mvn -B clean test-compile` (and `mvn test` if a device is available).
4. Open a pull/merge request; keep it focused and small.

## Coding conventions

- **Java 17**, standard formatting; keep classes small and single-purpose.
- **Package layout** mirrors responsibility, all under `src/test`: `driver`,
  `config`, `pages`, `utils`, `constants` (framework/support) alongside `base`,
  `tests`, `listeners`.
- **Page objects** expose actions, not locators. Declare one `PlatformLocator`
  field per element. Return the next page object from navigation actions.
- **Tests** assert; pages act. Never assert inside a page object.
- **No hard-coded config.** Add new values to the relevant `.properties` file and
  read them via `ConfigReader` / `CapabilitiesBuilder`.
- **Group every test** with `smoke` or `regression`.
- **Annotate for Allure**: `@Description` + `@Severity` on tests, `@Step` on page
  methods.

## Adding a screen

See [WRITING_TESTS](WRITING_TESTS.md#1-add-a-page-object). Extend `BasePage`,
declare `PlatformLocator`s, add `@Step` methods, register any new test class in
`testng.xml` under both platform blocks.

## Adding a capability or platform option

See [CONFIGURATION](CONFIGURATION.md#adding-a-new-capability). Add the key to the
platform `.properties` file and set it in `CapabilitiesBuilder`.

## Adding a utility or listener

- Utilities go in `utils/` and should be stateless/static where possible.
- New TestNG listeners go in `listeners/` and must be registered in `testng.xml`.

## Commit messages

Use concise, imperative messages (e.g. "Add SettingsPage and notification test").
Reference the tracker id where applicable so Allure `@Issue`/`@TmsLink` and commit
history line up.

## Definition of done

- Compiles: `mvn -B clean test-compile` passes.
- New behaviour is covered by at least one test.
- Docs updated if you changed structure, config, or conventions.
- No secrets committed (app signing keys, cloud credentials, passwords).

See also: [ARCHITECTURE](ARCHITECTURE.md)
