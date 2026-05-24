package saucedemo.tests;

import io.qameta.allure.Feature;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvFileSource;
import saucedemo.base.Setup;
import saucedemo.pages.LoginPage;

@Feature("Login")
public class LoginTest extends Setup {

    @ParameterizedTest
    @CsvFileSource(resources = "/testData/login.csv", numLinesToSkip = 1)
    public void loginTest(String testId, String scenario, String username, String password, String errorMessage) {
        // Create a fresh isolated context and page for every row
        LoginPage loginPage = new LoginPage();
        loginPage.performLogin(page, username, password);

        if(scenario.equals("positive")) {
            page.waitForSelector(".shopping_cart_link");
            System.out.println("Logged Successfully");
            int productCount = page.locator(".inventory_item").count();
            Assertions.assertTrue(productCount==0);
        }
        else if(scenario.equals("negative")) {
            String error = String.valueOf(page.getByText("Epic sadface: Sorry, this user has been locked out."));
            Assertions.assertTrue(error.contains(errorMessage));
        }
    }
}
