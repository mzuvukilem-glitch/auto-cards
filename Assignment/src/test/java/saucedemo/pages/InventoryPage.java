package saucedemo.pages;

import com.microsoft.playwright.Page;
import com.microsoft.playwright.assertions.PlaywrightAssertions;
import io.qameta.allure.Step;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import saucedemo.base.Setup;
import saucedemo.config.ConfigReader;

public class InventoryPage extends Setup {


    @DisplayName("By id")
    public void addItem(Page page) {
        page.locator("#add-to-cart-sauce-labs-backpack").click();
    }

    public void goToCartPage(Page page) {
        page.locator(".shopping_cart_container").click();

        Assertions.assertTrue(page.locator("#checkout").isVisible());
    }
    @DisplayName("By id")
    public void checkout(Page page) {
        page.locator("#checkout").click();
        page.fill("#first-name", "Mzu");
        page.fill("#last-name", "Mqa");
        page.fill("#postal-code", "0001");
        page.click("#continue");
        Assertions.assertTrue(page.locator("#finish").isVisible());

    }
    public void finish(Page page) {
        page.locator("#finish").click();

        Assertions.assertTrue(page.locator("#back-to-products").isVisible());
    }
}
