package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import org.testng.Assert;
import org.testng.annotations.Test;

public class SmokeTests extends BaseTest {

    @Test(groups = {"smoke"})
    @Description("App launches and the Login screen is reachable")
    public void appLaunchesToLogin() {
        LoginPage login = new LoginPage();
        Assert.assertTrue(login.isLoaded(), "Login screen should be displayed on launch");
    }
}
