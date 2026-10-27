# Writing Tests

How to add new screens, tests, and data, following the framework's conventions.

## The pattern in one picture

```
Test (tests/)            Page Object (pages/)         Locator
──────────────           ────────────────────         ────────────────────
LoginTests        ──►    LoginPage.loginAs()    ──►   PlatformLocator.of(
  asserts                  tap/type via BasePage          android, ios)
```

Tests never touch locators or the driver directly. They call intent-revealing
page methods and assert on the result.

## 1. Add a Page Object

Create a class in `src/main/java/.../pages/` extending `BasePage`. Declare one
`PlatformLocator` per element and expose actions, not locators.

```java
package com.company.automation.pages;

import io.appium.java_client.AppiumBy;
import io.qameta.allure.Step;

public class SettingsPage extends BasePage {

    private final PlatformLocator notificationsToggle = PlatformLocator.of(
            AppiumBy.id("com.example.app:id/notifications"),   // Android
            AppiumBy.accessibilityId("settings-notifications")); // iOS

    private final PlatformLocator saveButton = PlatformLocator.of(
            AppiumBy.id("com.example.app:id/save"),
            AppiumBy.accessibilityId("settings-save"));

    public boolean isLoaded() {
        return isDisplayed(saveButton);
    }

    @Step("Toggle notifications and save")
    public void enableNotifications() {
        tap(notificationsToggle);
        tap(saveButton);
    }
}
```

### BasePage helpers available to every page

| Method | Purpose |
|--------|---------|
| `tap(locator)` | wait for clickable, then click |
| `type(locator, text)` | wait, clear, send keys |
| `getText(locator)` | wait for visible, return text |
| `isDisplayed(locator)` | true if visible (swallows timeout) |
| `waitForVisible(locator)` | explicit wait, returns the element |

Each accepts either a raw `By` or a `PlatformLocator`.

## 2. Write the test

Create a class in `src/test/java/.../tests/` extending `BaseTest`. Use groups so
the suite can slice smoke vs regression.

```java
package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.pages.LoginPage;
import com.company.automation.pages.SettingsPage;
import io.qameta.allure.Description;
import io.qameta.allure.Severity;
import io.qameta.allure.SeverityLevel;
import org.testng.Assert;
import org.testng.annotations.Test;

public class SettingsTests extends BaseTest {

    @Test(groups = {"regression"})
    @Severity(SeverityLevel.NORMAL)
    @Description("User can enable notifications from Settings")
    public void enableNotifications() {
        SettingsPage settings = new LoginPage()
                .loginAs("standard_user", "secret_sauce")
                .openSettings();                 // add this nav method to HomePage

        Assert.assertTrue(settings.isLoaded());
        settings.enableNotifications();
    }
}
```

Then register the class in `testng.xml` under the Android and/or iOS `<test>`
blocks.

## 3. Data-driven tests (TestNG @DataProvider)

Use the existing `JsonDataReader` with a `@DataProvider` to run one test across
many data rows. Example using `src/test/resources/testdata/loginData.json`:

```java
import com.company.automation.utils.JsonDataReader;
import org.testng.annotations.DataProvider;

@DataProvider(name = "logins")
public Object[][] logins() {
    var rows = JsonDataReader.readAsList("loginData.json");
    return rows.stream().map(r -> new Object[]{r}).toArray(Object[][]::new);
}

@Test(dataProvider = "logins", groups = {"regression"})
public void loginScenarios(java.util.Map<String, Object> data) {
    var home = new LoginPage().loginAs(
            (String) data.get("username"), (String) data.get("password"));
    boolean expectHome = Boolean.TRUE.equals(data.get("expectHome"));
    Assert.assertEquals(home.isLoaded(), expectHome);
}
```

For Excel data, use `ExcelReader.read(path, sheet)` the same way.

## 4. Allure steps and metadata

- `@Step("...")` on page methods — appears as a nested step in the report.
  Supports placeholders: `@Step("Log in as '{username}'")`.
- `@Description`, `@Severity(...)` on tests.
- `@Link`, `@Issue`, `@TmsLink` for traceability (patterns in `allure.properties`).

## Conventions

- **Pages return pages.** A successful action that navigates returns the next
  page object, enabling fluent chains (`login().openCart().placeOrder()`).
- **One locator pair per element**, declared as fields — never inline in methods.
- **Tests assert; pages act.** Keep assertions out of page objects.
- **Prefer accessibility ids.** They often work identically on both platforms.
- **Group every test** (`smoke` or `regression`) so suites stay sliceable.

For a full catalogue of locator strategies and UI interactions with examples, see
[LOCATORS_AND_INTERACTIONS](LOCATORS_AND_INTERACTIONS.md).

See also: [CROSS_PLATFORM](CROSS_PLATFORM.md) · [REPORTING](REPORTING.md)
