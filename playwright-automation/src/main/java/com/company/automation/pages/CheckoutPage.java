package com.company.automation.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import io.qameta.allure.Step;

/**
 * Checkout flow: customer information, overview, and confirmation.
 */
public class CheckoutPage extends BasePage {

    private final Locator firstName;
    private final Locator lastName;
    private final Locator postalCode;
    private final Locator continueButton;
    private final Locator finishButton;
    private final Locator confirmation;

    public CheckoutPage(Page page) {
        super(page);
        this.firstName = page.locator("#first-name");
        this.lastName = page.locator("#last-name");
        this.postalCode = page.locator("#postal-code");
        this.continueButton = page.locator("#continue");
        this.finishButton = page.locator("#finish");
        this.confirmation = page.locator(".complete-header");
    }

    @Override
    protected String path() {
        return "/checkout-step-one.html";
    }

    @Step("Enter customer info and continue")
    public CheckoutPage fillCustomerInfo(String first, String last, String zip) {
        type(firstName, first);
        type(lastName, last);
        type(postalCode, zip);
        click(continueButton);
        return this;
    }

    @Step("Finish the order")
    public String finish() {
        click(finishButton);
        return text(confirmation);
    }
}
