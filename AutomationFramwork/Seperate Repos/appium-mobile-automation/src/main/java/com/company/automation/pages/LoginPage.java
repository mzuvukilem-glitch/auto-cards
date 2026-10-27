package com.company.automation.pages;

import io.appium.java_client.AppiumBy;
import io.qameta.allure.Step;

/**
 * Page Object for the Login screen. Each element declares an Android and an iOS locator; {@link
 * PlatformLocator} picks the right one at runtime, so this single class drives both platforms.
 */
public class LoginPage extends BasePage {

    private final PlatformLocator usernameField =
            PlatformLocator.of(
                    AppiumBy.id("com.example.app:id/username"),
                    AppiumBy.accessibilityId("login-username"));

    private final PlatformLocator passwordField =
            PlatformLocator.of(
                    AppiumBy.id("com.example.app:id/password"),
                    AppiumBy.accessibilityId("login-password"));

    private final PlatformLocator loginButton =
            PlatformLocator.of(
                    AppiumBy.id("com.example.app:id/btnLogin"),
                    AppiumBy.accessibilityId("login-button"));

    private final PlatformLocator errorMessage =
            PlatformLocator.of(
                    AppiumBy.id("com.example.app:id/error"),
                    AppiumBy.accessibilityId("login-error"));

    @Step("Log in as '{username}'")
    public HomePage loginAs(String username, String password) {
        type(usernameField, username);
        type(passwordField, password);
        tap(loginButton);
        return new HomePage();
    }

    public String getErrorMessage() {
        return getText(errorMessage);
    }

    public boolean isLoaded() {
        return isDisplayed(loginButton);
    }
}
