package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import com.company.automation.pages.CartPage;
import com.company.automation.pages.CheckoutPage;
import com.company.automation.pages.InventoryPage;
import io.qameta.allure.Description;
import io.qameta.allure.Severity;
import io.qameta.allure.SeverityLevel;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("regression")
class CheckoutTests extends BaseTest {

    @Test
    @Severity(SeverityLevel.CRITICAL)
    @DisplayName("End-to-end purchase flow completes")
    @Description("Add a product, go through checkout, and reach the confirmation")
    void completePurchase() {
        InventoryPage inventory = openLogin()
                .login(ConfigReader.get("standard.user"), ConfigReader.get("standard.password"));

        inventory.addToCart("Sauce Labs Backpack");
        assertEquals(1, inventory.getCartCount(), "Cart should show one item");

        CartPage cart = inventory.openCart();
        assertTrue(cart.isLoaded(), "Cart page should be displayed");
        assertEquals(1, cart.itemCount(), "Cart should contain one line item");

        CheckoutPage checkout = cart.checkout()
                .fillCustomerInfo("Test", "User", "12345");

        String confirmation = checkout.finish();
        assertEquals("Thank you for your order!", confirmation, "Order confirmation should be shown");
    }
}
