package com.company.automation.tests.examples;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import com.company.automation.utils.Accessibility;
import io.qameta.allure.Description;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Accessibility (a11y) smoke check using axe-core injected via {@link Accessibility}. Tagged {@code
 * a11y} so it can be run as its own suite: {@code mvn test -Dgroups=a11y}.
 */
@Tag("a11y")
class AccessibilityExampleTest extends BaseTest {

    @Test
    @DisplayName("Login page has no axe-core violations above threshold")
    @Description("Runs axe-core and asserts the violation count is within an agreed budget")
    void loginPageAccessibility() {
        page.navigate(ConfigReader.get("base.url") + "/");
        int violations = Accessibility.violationCount(page);
        // Assert against a budget rather than strict zero — real apps rarely start at 0.
        int budget = ConfigReader.getInt("a11y.violation.budget", 50);
        assertTrue(
                violations <= budget,
                "axe-core violations " + violations + " exceeded budget " + budget);
    }
}
