package com.company.automation.pages;

import com.company.automation.constants.FrameworkConstants;
import com.company.automation.driver.DriverManager;
import io.appium.java_client.AppiumDriver;
import java.time.Duration;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

/**
 * Base for all Page Objects. Wraps common element interactions with explicit waits so individual
 * pages stay thin and readable.
 */
public abstract class BasePage {

    protected final Logger log = LogManager.getLogger(getClass());
    protected final AppiumDriver driver;
    protected final WebDriverWait wait;

    protected BasePage() {
        this.driver = DriverManager.getDriver();
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(FrameworkConstants.EXPLICIT_WAIT));
    }

    protected WebElement waitForVisible(By locator) {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    protected WebElement waitForClickable(By locator) {
        return wait.until(ExpectedConditions.elementToBeClickable(locator));
    }

    protected void tap(By locator) {
        log.debug("tap {}", locator);
        waitForClickable(locator).click();
    }

    protected void type(By locator, String text) {
        log.debug("type '{}' into {}", text, locator);
        WebElement element = waitForVisible(locator);
        element.clear();
        element.sendKeys(text);
    }

    protected String getText(By locator) {
        return waitForVisible(locator).getText();
    }

    protected boolean isDisplayed(By locator) {
        try {
            return waitForVisible(locator).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    // ---- Platform-aware overloads (resolve Android/iOS locator at runtime) ----

    protected WebElement waitForVisible(PlatformLocator locator) {
        return waitForVisible(locator.resolve());
    }

    protected void tap(PlatformLocator locator) {
        tap(locator.resolve());
    }

    protected void type(PlatformLocator locator, String text) {
        type(locator.resolve(), text);
    }

    protected String getText(PlatformLocator locator) {
        return getText(locator.resolve());
    }

    protected boolean isDisplayed(PlatformLocator locator) {
        return isDisplayed(locator.resolve());
    }
}
