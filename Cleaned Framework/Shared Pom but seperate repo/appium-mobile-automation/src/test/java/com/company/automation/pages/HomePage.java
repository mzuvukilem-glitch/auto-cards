package com.company.automation.pages;

import io.appium.java_client.AppiumBy;
import io.qameta.allure.Step;

/**
 * Page Object for the Home screen shown after a successful login. Declares both Android and iOS
 * locators for cross-platform support.
 */
public class HomePage extends BasePage {

    private final PlatformLocator welcomeBanner =
            PlatformLocator.of(
                    AppiumBy.id("com.example.app:id/welcome"),
                    AppiumBy.accessibilityId("home-welcome"));

    private final PlatformLocator cartButton =
            PlatformLocator.of(
                    AppiumBy.id("com.example.app:id/cart"), AppiumBy.accessibilityId("home-cart"));

    public boolean isLoaded() {
        return isDisplayed(welcomeBanner);
    }

    public String getWelcomeText() {
        return getText(welcomeBanner);
    }

    @Step("Open the cart")
    public CheckoutPage openCart() {
        tap(cartButton);
        return new CheckoutPage();
    }
}
