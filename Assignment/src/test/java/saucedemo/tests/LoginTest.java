package saucedemo.tests;

import com.microsoft.playwright.assertions.PlaywrightAssertions;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvFileSource;
import saucedemo.base.BrowserSetup;
import saucedemo.config.ConfigReader;

public class LoginTest extends BrowserSetup {

    @ParameterizedTest
    @CsvFileSource(resources = "/users.csv", numLinesToSkip = 1)
    public void loginTest(String testId, String scenario, String username, String password) {
        // Create a fresh isolated context and page for every row

        String url = ConfigReader.getProperty("url");
        page.navigate(url);
        performLogin(page, username, password);

        page.waitForSelector(".shopping_cart_link");
        System.out.println("Logged Successfully");
        int productCount = page.locator(".inventory_item").count();
        Assertions.assertTrue(productCount>0);

    }

    @ParameterizedTest
    @CsvFileSource(resources = "/users.csv", numLinesToSkip = 1)
    public void logoutTest(String testId, String scenario,String username, String password) {
        // Create a fresh isolated context and page for every row

        String url = ConfigReader.getProperty("url");
        page.navigate(url);
        performLogin(page, username, password);

        page.waitForSelector(".shopping_cart_link");

        page.locator("[id='react-burger-menu-btn']").click();
        page.locator("[id='logout_sidebar_link']").click();
        PlaywrightAssertions.assertThat(page.locator("[placeholder='Username']")).isVisible();
        System.out.println("Logged Out Successfully");

    }
}
