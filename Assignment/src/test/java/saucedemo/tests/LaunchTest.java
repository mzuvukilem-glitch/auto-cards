package saucedemo.tests;

import com.microsoft.playwright.assertions.PlaywrightAssertions;
import org.junit.jupiter.api.*;
import saucedemo.base.BrowserSetup;
import saucedemo.config.ConfigReader;

public class LaunchTest extends BrowserSetup {

//    static Playwright playwright;
//    static Browser browser;
//    static BrowserContext browserContext;
//    Page page;
//
//    @BeforeAll
//    public static void setupBrowser() {
//        playwright = Playwright.create();
//        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(false));
//        browserContext = browser.newContext();
//    }
//    @BeforeEach
//    public void setupUp() {
//        page = browserContext.newPage();
//    }
//    @AfterAll
//    public static void teardown() {
//        browser.close();
//        playwright.close();
//    }

    @Test
    public void loginTest(){

        String url = ConfigReader.getProperty("url");
        page.navigate(url);
        playwright.selectors().setTestIdAttribute("data-test");
        PlaywrightAssertions.assertThat(page.getByTestId("login-button")).isVisible();

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
        String url = ConfigReader.getProperty("url");
        page.navigate(url);
        String title = page.title();
        Assertions.assertEquals("Swag Labs", title);
        page.locator("[placeholder='Username']").click();
        page.locator("[placeholder='Username']").fill("standard_user");

        page.locator("[placeholder='Password']").click();
        page.locator("[placeholder='Password']").fill("secret_sauce");

        page.locator("[id='login-button']").click();

        page.waitForSelector(".shopping_cart_link");

        System.out.println("Login Successful");
        page.locator("[id='react-burger-menu-btn']").click();
        page.locator("[id='logout_sidebar_link']").click();

        Assertions.assertEquals("Swag Labs", title);
    }
}
