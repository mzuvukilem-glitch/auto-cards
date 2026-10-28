package com.company.automation.tests.examples;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import com.company.automation.pages.InventoryPage;
import io.qameta.allure.Description;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Demonstrates AssertJ {@link SoftAssertions}: collect multiple checks and report all failures at
 * the end (via {@code assertAll()}), instead of stopping at the first. JUnit 5 has no built-in soft
 * assertions, so AssertJ provides them.
 */
@Tag("regression")
class SoftAssertExampleTest extends BaseTest {

    @Test
    @DisplayName("Verify several inventory properties, reporting all failures together")
    @Description("AssertJ soft assertions collect every failure before failing the test")
    void inventoryHasExpectedState() {
        InventoryPage inventory =
                openLogin()
                        .login(
                                ConfigReader.get("standard.user", "standard_user"),
                                ConfigReader.get("standard.password", "secret_sauce"));

        SoftAssertions soft = new SoftAssertions();
        // All checks run even if an earlier one fails.
        soft.assertThat(inventory.isLoaded()).as("inventory loaded").isTrue();
        soft.assertThat(inventory.getCartCount()).as("cart starts empty").isZero();
        soft.assertThat(page.url()).as("on inventory url").contains("inventory");
        // Reports every failure collected above; passes only if all passed.
        soft.assertAll();
    }
}
