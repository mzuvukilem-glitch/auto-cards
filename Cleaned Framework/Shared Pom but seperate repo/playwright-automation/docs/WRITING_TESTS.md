# Writing Tests

How to add screens, tests, and data, following the framework's conventions.

## The pattern in one picture

```
Test (tests/)          Page Object (pages/)        Playwright Locator
──────────────         ────────────────────        ──────────────────
LoginTests       ──►   LoginPage.login()      ──►  page.getByPlaceholder(...)
  asserts                click/fill via BasePage      .click()/.fill() (auto-wait)
```

Tests never touch the browser or locators directly. They call intent-revealing
page methods and assert on the result.

## 1. Add a Page Object

Create a class in `src/test/java/.../pages/` extending `BasePage`. Declare
`Locator` fields and expose actions that return the next page.

```java
package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import io.qameta.allure.Step;

public class AccountPage extends BasePage {

    private final Locator logoutButton;
    private final Locator menu;

    public AccountPage(Page page) {
        super(page);
        this.menu = page.locator("#react-burger-menu-btn");
        this.logoutButton = page.locator("#logout_sidebar_link");
    }

    @Override
    protected String path() {
        return "/inventory.html";
    }

    @Step("Log out")
    public LoginPage logout() {
        click(menu);
        click(logoutButton);
        return new LoginPage(page);
    }
}
```

### BasePage helpers available to every page

| Method | Purpose |
|--------|---------|
| `open()` | navigate to `base.url + path()` |
| `click(locator)` | click (Playwright auto-waits for actionability) |
| `type(locator, text)` | fill a field |
| `text(locator)` | trimmed text content |
| `isVisible(locator)` | visibility check |
| `title()` / `url()` | page title / current URL |

### Locator strategy (Playwright)

Prefer user-facing, resilient locators in this order:

1. `page.getByRole(...)` — accessibility role + name
2. `page.getByTestId(...)` — uses `data-test` (configured as the test-id attribute)
3. `page.getByPlaceholder(...)` / `getByLabel(...)` / `getByText(...)`
4. CSS `page.locator("#id")` — fine for stable ids
5. XPath — last resort

## 2. Write the test

Create a class in `src/test/java/.../tests/` extending `BaseTest`. Tag it so the
suite can slice smoke vs regression.

```java
package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import io.qameta.allure.Description;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("regression")
class AccountTests extends BaseTest {

    @Test
    @DisplayName("User can log out")
    @Description("A logged-in user returns to the login screen after logout")
    void userCanLogOut() {
        var login = openLogin()
                .login(ConfigReader.get("standard.user"), ConfigReader.get("standard.password"))
                .logout();                  // add logout() nav as needed
        assertTrue(login.isLoaded());
    }
}
```

## 3. Data-driven tests (JUnit 5)

Use `@ParameterizedTest` with a source. Inline CSV (see `LoginTests`):

```java
@ParameterizedTest(name = "invalid login: {0}/{1}")
@CsvSource({
    "locked_out_user,secret_sauce",
    "standard_user,wrong_password"
})
void invalidLogin(String user, String pass) {
    openLogin().login(user, pass);
    // assert error
}
```

For richer data use `@MethodSource` (return a `Stream<Arguments>`) or
`@CsvFileSource` (a CSV under `src/test/resources`). For JSON, read with Jackson
in a `@MethodSource` provider.

## 4. Allure metadata

- `@DisplayName("...")` — human-readable test name (JUnit 5).
- `@Description("...")`, `@Severity(...)` — Allure test metadata.
- `@Step("...")` on page methods — nested steps in the report; supports
  positional placeholders like `@Step("Log in as '{0}'")`.
- `@Issue` / `@TmsLink` — traceability (patterns in `allure.properties`).

## Conventions

- **Pages return pages.** Navigation actions return the next page object for
  fluent chains (`openLogin().login(...).openCart().checkout()`).
- **Declare locators as fields**, built in the constructor — never inline.
- **Tests assert; pages act.** Keep assertions out of page objects.
- **Prefer role/test-id locators** over brittle CSS/XPath.
- **Tag every test** (`smoke` or `regression`).
- **Don't add explicit sleeps.** Rely on Playwright auto-waiting; raise timeouts
  in config if a page is genuinely slow.

For a full catalogue of locator strategies and UI interactions with examples, see
[LOCATORS_AND_INTERACTIONS](LOCATORS_AND_INTERACTIONS.md).

See also: [CROSS_BROWSER](CROSS_BROWSER.md) · [REPORTING](REPORTING.md)
