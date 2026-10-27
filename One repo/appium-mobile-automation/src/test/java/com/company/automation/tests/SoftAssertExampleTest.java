package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import com.company.automation.pages.HomePage;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import org.testng.annotations.Test;
import org.testng.asserts.SoftAssert;

/**
 * Demonstrates TestNG {@link SoftAssert}: collect multiple checks and report all failures at the
 * end (via {@code assertAll()}), instead of stopping at the first failed assertion. Useful for
 * verifying several independent things about one screen in a single test.
 */
public class SoftAssertExampleTest extends BaseTest {

    @Test(groups = {"regression"})
    @Description("Verify several Home screen properties, reporting all failures together")
    public void homeScreenHasExpectedElements() {
        HomePage home =
                new LoginPage()
                        .loginAs(
                                ConfigReader.get("standard.user", "standard_user"),
                                ConfigReader.get("standard.password", "secret_sauce"));

        SoftAssert soft = new SoftAssert();
        // All three checks run even if an earlier one fails.
        soft.assertTrue(home.isLoaded(), "Home screen should be loaded");
        soft.assertFalse(home.getWelcomeText().isBlank(), "Welcome text should be present");
        soft.assertTrue(home.getWelcomeText().length() > 2, "Welcome text should be meaningful");
        // Reports every failure collected above; passes only if all passed.
        soft.assertAll();
    }
}
