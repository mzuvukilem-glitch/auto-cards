package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("smoke")
class SmokeTests extends BaseTest {

    @Test
    @DisplayName("App loads to the login screen")
    @Description("The application is reachable and renders the login form")
    void appLoadsToLogin() {
        LoginPage login = openLogin();
        assertTrue(login.isLoaded(), "Login form should be visible on load");
    }
}
