package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import com.company.automation.pages.InventoryPage;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import io.qameta.allure.Severity;
import io.qameta.allure.SeverityLevel;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("regression")
class LoginTests extends BaseTest {

    @Test
    @Tag("smoke")
    @Severity(SeverityLevel.BLOCKER)
    @DisplayName("Valid credentials land on the inventory page")
    @Description("A standard user can log in and reach the products listing")
    void validLogin() {
        LoginPage login = openLogin();
        assertTrue(login.isLoaded(), "Login page should be displayed");

        InventoryPage inventory = login.login(
                ConfigReader.get("standard.user"),
                ConfigReader.get("standard.password"));

        assertTrue(inventory.isLoaded(), "Inventory page should be displayed after login");
    }

    @ParameterizedTest(name = "invalid login: {0}/{1}")
    @CsvSource({
            "locked_out_user,secret_sauce",
            "standard_user,wrong_password",
            "'',''"
    })
    @DisplayName("Invalid credentials surface an error")
    void invalidLogin(String user, String pass) {
        LoginPage login = openLogin();
        login.login(user, pass);
        assertFalse(login.getError().isBlank(), "An error message should be shown");
    }
}
