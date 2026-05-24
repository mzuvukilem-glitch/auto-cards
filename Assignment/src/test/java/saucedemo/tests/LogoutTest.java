package saucedemo.tests;

import com.microsoft.playwright.assertions.PlaywrightAssertions;
import io.qameta.allure.Feature;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvFileSource;
import saucedemo.base.Setup;
import saucedemo.pages.LoginPage;

@Feature("Log Out")
public class LogoutTest extends Setup {

    @ParameterizedTest
    @CsvFileSource(resources = "/testData/logout.csv", numLinesToSkip = 1)
    public void logoutTest(String testId, String scenario,String username, String password) {
        // Create a fresh isolated context and page for every row
        LoginPage loginPage = new LoginPage();
        loginPage.performLogin(page, username, password);

        page.waitForSelector(".shopping_cart_link");

        page.locator("[id='react-burger-menu-btn']").click();
        page.locator("[id='logout_sidebar_link']").click();
        PlaywrightAssertions.assertThat(page.locator("[placeholder='Username']")).isVisible();
        System.out.println("Logged Out Successfully");

    }
}
