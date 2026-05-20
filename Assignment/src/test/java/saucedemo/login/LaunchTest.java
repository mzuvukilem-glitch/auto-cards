package saucedemo.login;

import com.microsoft.playwright.*;
import com.microsoft.playwright.junit.UsePlaywright;
import org.junit.jupiter.api.*;

@UsePlaywright
public class LaunchTest {

//    Playwright playwright;
//    Browser browser;
//    Page page;
//
//    @BeforeEach
//    public void setup() {
//        playwright = Playwright.create();
//        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(false));
//        page = browser.newPage();
//        page.navigate("https://www.saucedemo.com/");
//        String title = page.title();
//        Assertions.assertEquals(title, "Swag Labs");
//    }
//    @AfterEach
//    public void teardown() {
//        browser.close();
//        playwright.close();
//    }

    @Test
    void loginTest(Page page){
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
}
