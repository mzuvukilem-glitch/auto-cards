package saucedemo.pages;

import com.microsoft.playwright.Page;
import io.qameta.allure.Step;
import org.junit.jupiter.api.DisplayName;
import saucedemo.base.Setup;
import saucedemo.config.ConfigReader;

public class LoginPage extends Setup {

    @Step("Login into page")
    @DisplayName("By id")
    public void performLogin(Page page, String username, String password) {
        String url = ConfigReader.getProperty("url");
        page.navigate(url);
        page.fill("#user-name", username);
        page.fill("#password", password);
        page.click("#login-button");
    }
}

