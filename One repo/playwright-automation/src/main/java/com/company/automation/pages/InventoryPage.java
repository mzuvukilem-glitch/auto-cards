package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import io.qameta.allure.Step;
import java.util.List;

/** Inventory / product-listing screen shown after login. */
public class InventoryPage extends BasePage {

    private final Locator title;
    private final Locator cartLink;
    private final Locator cartBadge;
    private final Locator menuButton;
    private final Locator logoutLink;
    private final Locator sortDropdown;
    private final Locator itemNames;
    private final Locator itemPrices;

    public InventoryPage(Page page) {
        super(page);
        this.title = page.locator(".title");
        this.cartLink = page.locator(".shopping_cart_link");
        this.cartBadge = page.locator(".shopping_cart_badge");
        this.menuButton = page.locator("#react-burger-menu-btn");
        this.logoutLink = page.locator("#logout_sidebar_link");
        this.sortDropdown = page.locator("[data-test='product-sort-container']");
        this.itemNames = page.locator(".inventory_item_name");
        this.itemPrices = page.locator(".inventory_item_price");
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

    @Step("Log out")
    public LoginPage logout() {
        // saucedemo hides logout behind the burger menu; open it, then click logout.
        click(menuButton);
        // The menu slides in; wait for the logout link to be actionable (auto-waited by click).
        click(logoutLink);
        return new LoginPage(page);
    }

    /**
     * Select a sort option by the site's option value: {@code az}, {@code za}, {@code lohi}, {@code
     * hilo}.
     */
    @Step("Sort products by '{0}'")
    public InventoryPage sortBy(String optionValue) {
        sortDropdown.selectOption(optionValue);
        return this;
    }

    /** Current product names, in displayed order. */
    public List<String> productNames() {
        return itemNames.allTextContents().stream().map(String::trim).toList();
    }

    /** Current product prices, in displayed order (numeric, "$" stripped). */
    public List<Double> productPrices() {
        return itemPrices.allTextContents().stream()
                .map(p -> Double.parseDouble(p.trim().replace("$", "")))
                .toList();
    }

    public boolean isLoaded() {
        return text(title).equals("Products");
    }
}
