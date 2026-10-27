package com.company.automation.pages;

import io.appium.java_client.AppiumBy;
import io.qameta.allure.Step;

/**
 * Page Object for the Checkout screen.
 * Declares both Android and iOS locators for cross-platform support.
 */
public class CheckoutPage extends BasePage {

    private final PlatformLocator placeOrderButton = PlatformLocator.of(
            AppiumBy.id("com.example.app:id/placeOrder"),
            AppiumBy.accessibilityId("checkout-place-order"));

    private final PlatformLocator orderConfirmation = PlatformLocator.of(
            AppiumBy.id("com.example.app:id/confirmation"),
            AppiumBy.accessibilityId("checkout-confirmation"));

    public boolean isLoaded() {
        return isDisplayed(placeOrderButton);
    }

    @Step("Place the order")
    public String placeOrder() {
        tap(placeOrderButton);
        return getText(orderConfirmation);
    }
}
