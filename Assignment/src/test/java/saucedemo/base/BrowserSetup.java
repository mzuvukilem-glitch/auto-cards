package saucedemo.base;

import com.microsoft.playwright.*;
import org.junit.jupiter.api.*;
import saucedemo.config.BrowserTypeOption;
import saucedemo.config.ConfigReader;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class BrowserSetup {

    protected static Playwright playwright;
    protected static Browser browser;
    protected static BrowserContext browserContext;
    protected static Page page;
    protected static final BrowserTypeOption CHOSEN_BROWSER = BrowserTypeOption.CHROMIUM;

    @BeforeAll
    public static void setupBrowser() {
        // Initialize Playwright and launch a browser
        playwright = Playwright.create();

        // Fetch browser and headless properties from properties file
        String browserProp = ConfigReader.getProperty("browser");
        String headlessProp = ConfigReader.getProperty("headless");

        boolean isHeadless = headlessProp == null || Boolean.parseBoolean(headlessProp);
        BrowserType.LaunchOptions options = new BrowserType.LaunchOptions().setHeadless(isHeadless);
        BrowserTypeOption chosenBrowser;

        try {
            chosenBrowser = (browserProp != null)
                    ? BrowserTypeOption.valueOf(browserProp.toUpperCase())
                    : BrowserTypeOption.CHROMIUM;
        } catch (IllegalArgumentException e) {
            System.out.println("Invalid browser property value. Defaulting to CHROMIUM.");
            chosenBrowser = BrowserTypeOption.CHROMIUM;
        }

        switch (chosenBrowser) {
            case FIREFOX:
                browser = playwright.firefox().launch(options);
                break;
            case WEBKIT:
                browser = playwright.webkit().launch(options);
                break;
            case CHROMIUM:
            default:
                browser = playwright.chromium().launch(options);
                break;
        }
    }

    @DisplayName("By id")
    protected void performLogin(Page page, String username, String password) {
        page.fill("#user-name", username);
        page.fill("#password", password);
        page.click("#login-button");
    }
    @BeforeEach
    public void setupPage() {
        browserContext = browser.newContext();
        page = browserContext.newPage();
    }
    @AfterAll
    public static void teardown() {
        browser.close();
        playwright.close();
    }

}
