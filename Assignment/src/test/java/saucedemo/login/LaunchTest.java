package saucedemo.login;

import com.microsoft.playwright.*;
import com.microsoft.playwright.junit.Options;
import com.microsoft.playwright.junit.OptionsFactory;
import com.microsoft.playwright.junit.UsePlaywright;
import org.junit.jupiter.api.*;

//@UsePlaywright(LaunchTest.CustomOptions)
public class LaunchTest{

    static Playwright playwright;
    static Browser browser;
    static BrowserContext browserContext;
    Page page;

    @BeforeAll
    public static void setupBrowser() {
        playwright = Playwright.create();
        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(false));
        browserContext = browser.newContext();
    }
    @BeforeEach
    public void setupUp() {
        page = browserContext.newPage();
    }
    @AfterAll
    public static void teardown() {
        browser.close();
        playwright.close();
    }

    @Test
    public void loginTest(){
        page.navigate("https://www.saucedemo.com/");
        String title = page.title();
        Assertions.assertEquals(title, "Swag Labs");
        page.locator("[placeholder='Username']").click();
        page.locator("[placeholder='Username']").fill("standard_user");

        page.locator("[placeholder='Password']").click();
        page.locator("[placeholder='Password']").fill("secret_sauce");

        page.locator("[id='login-button']").click();

        page.waitForSelector(".shopping_cart_link");

        System.out.println("Login Successful");

        int productCount = page.locator(".inventory_item").count();
        Assertions.assertTrue(productCount>0);


    }
    @Test
    public void logoutTest(){
        page.navigate("https://www.saucedemo.com/");
        String title = page.title();
        Assertions.assertEquals(title, "Swag Labs");
        page.locator("[placeholder='Username']").click();
        page.locator("[placeholder='Username']").fill("standard_user");

        page.locator("[placeholder='Password']").click();
        page.locator("[placeholder='Password']").fill("secret_sauce");

        page.locator("[id='login-button']").click();

        page.waitForSelector(".shopping_cart_link");

        System.out.println("Login Successful");
        page.locator("[id='react-burger-menu-btn']").click();
        page.locator("[id='logout_sidebar_link']").click();

        Assertions.assertEquals(title, "Swag Labs");

    }
//    public static class CustomOptions implements OptionsFactory{
//        @Override
//        public Options getOptions() {
//            return new Options().setHeadless(true);
//        }
//    }
}
