package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import io.qameta.allure.Step;

/**
 * Inventory / product-listing screen shown after login.
 */
public class InventoryPage extends BasePage {

    private final Locator title;
    private final Locator cartLink;
    private final Locator cartBadge;

    public InventoryPage(Page page) {
        super(page);
        this.title = page.locator(".title");
        this.cartLink = page.locator(".shopping_cart_link");
        this.cartBadge = page.locator(".shopping_cart_badge");
    }

    @Override
    protected String path() {
        return "/inventory.html";
    }

    @Step("Add product '{0}' to the cart")
    public InventoryPage addToCart(String productName) {
        String id = productName.toLowerCase().replace(" ", "-");
        click(page.locator("[data-test='add-to-cart-" + id + "']"));
        return this;
    }

    public int getCartCount() {
        if (!isVisible(cartBadge)) {
            return 0;
        }
        return Integer.parseInt(text(cartBadge));
    }

    @Step("Open the cart")
    public CartPage openCart() {
        click(cartLink);
        return new CartPage(page);
    }

    public boolean isLoaded() {
        return text(title).equals("Products");
    }
}
