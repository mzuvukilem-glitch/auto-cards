package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import io.qameta.allure.Step;

/**
 * Login screen (saucedemo.com).
 */
public class LoginPage extends BasePage {

    private final Locator username;
    private final Locator password;
    private final Locator loginButton;
    private final Locator errorMessage;

    public LoginPage(Page page) {
        super(page);
        this.username = page.getByPlaceholder("Username");
        this.password = page.getByPlaceholder("Password");
        this.loginButton = page.locator("#login-button");
        this.errorMessage = page.locator("[data-test='error']");
    }

    @Override
    protected String path() {
        return "/";
    }

    @Step("Log in as '{0}'")
    public InventoryPage login(String user, String pass) {
        type(username, user);
        type(password, pass);
        click(loginButton);
        return new InventoryPage(page);
    }

    public String getError() {
        return text(errorMessage);
    }

    public boolean isLoaded() {
        return isVisible(loginButton);
    }
}
