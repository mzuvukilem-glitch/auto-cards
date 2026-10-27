package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import io.qameta.allure.Step;

/**
 * Shopping cart screen.
 */
public class CartPage extends BasePage {

    private final Locator title;
    private final Locator checkoutButton;
    private final Locator cartItems;

    public CartPage(Page page) {
        super(page);
        this.title = page.locator(".title");
        this.checkoutButton = page.locator("#checkout");
        this.cartItems = page.locator(".cart_item");
    }

    @Override
    protected String path() {
        return "/cart.html";
    }

    public int itemCount() {
        return cartItems.count();
    }

    @Step("Proceed to checkout")
    public CheckoutPage checkout() {
        click(checkoutButton);
        return new CheckoutPage(page);
    }

    public boolean isLoaded() {
        return text(title).equals("Your Cart");
    }
}
