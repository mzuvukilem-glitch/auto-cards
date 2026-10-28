package com.company.automation.utils;

import com.company.automation.constants.FrameworkConstants;
import com.company.automation.driver.DriverManager;
import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.FluentWait;
import org.openqa.selenium.support.ui.Wait;

/** Explicit and fluent wait helpers. */
public final class WaitUtils {

    private WaitUtils() {}

    public static WebElement fluentVisible(By locator) {
        Wait<io.appium.java_client.AppiumDriver> wait =
                new FluentWait<>(DriverManager.getDriver())
                        .withTimeout(Duration.ofSeconds(FrameworkConstants.EXPLICIT_WAIT))
                        .pollingEvery(Duration.ofMillis(FrameworkConstants.POLLING_INTERVAL_MS))
                        .ignoring(org.openqa.selenium.NoSuchElementException.class);
        return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }
}
