package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.listeners.RetryAnalyzer;
import com.company.automation.pages.HomePage;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import io.qameta.allure.Severity;
import io.qameta.allure.SeverityLevel;
import org.testng.Assert;
import org.testng.annotations.Test;

public class LoginTests extends BaseTest {

    @Test(groups = {"smoke"}, retryAnalyzer = RetryAnalyzer.class)
    @Severity(SeverityLevel.BLOCKER)
    @Description("Valid credentials should land the user on the Home screen")
    public void validLoginShowsHome() {
        LoginPage login = new LoginPage();
        Assert.assertTrue(login.isLoaded(), "Login screen should be displayed");

        HomePage home = login.loginAs("standard_user", "secret_sauce");
        Assert.assertTrue(home.isLoaded(), "Home screen should be displayed after login");
    }

    @Test(groups = {"regression"})
    @Severity(SeverityLevel.CRITICAL)
    @Description("Invalid credentials should surface an error message")
    public void invalidLoginShowsError() {
        LoginPage login = new LoginPage();
        login.loginAs("bad_user", "wrong_pass");
        Assert.assertFalse(login.getErrorMessage().isBlank(), "An error message should be shown");
    }
}
