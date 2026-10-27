package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.pages.CheckoutPage;
import com.company.automation.pages.HomePage;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import org.testng.Assert;
import org.testng.annotations.Test;

public class CheckoutTests extends BaseTest {

    @Test(groups = {"regression"})
    @Description("A logged-in user can place an order from the cart")
    public void placeOrderShowsConfirmation() {
        LoginPage login = new LoginPage();
        HomePage home = login.loginAs("standard_user", "secret_sauce");

        CheckoutPage checkout = home.openCart();
        Assert.assertTrue(checkout.isLoaded(), "Checkout screen should be displayed");

        String confirmation = checkout.placeOrder();
        Assert.assertFalse(confirmation.isBlank(), "Order confirmation should be shown");
    }
}
