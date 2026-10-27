package com.company.automation.pages;

import com.company.automation.driver.DriverManager;
import com.company.automation.driver.Platform;
import org.openqa.selenium.By;

/**
 * Holds an Android and an iOS locator for the same logical element and resolves the correct one for
 * the active platform at runtime. This is what lets a single Page Object drive both Android and
 * iOS.
 *
 * <pre>
 * private final PlatformLocator loginButton = PlatformLocator.of(
 *         AppiumBy.id("com.example.app:id/btnLogin"),          // Android
 *         AppiumBy.accessibilityId("login-button"));           // iOS
 * </pre>
 */
public final class PlatformLocator {

    private final By android;
    private final By ios;

    private PlatformLocator(By android, By ios) {
        this.android = android;
        this.ios = ios;
    }

    public static PlatformLocator of(By android, By ios) {
        return new PlatformLocator(android, ios);
    }

    /** Resolves to the locator for the current thread's platform. */
    public By resolve() {
        Platform platform = DriverManager.getPlatform();
        By locator = (platform == Platform.ANDROID) ? android : ios;
        if (locator == null) {
            throw new IllegalStateException("No locator defined for platform: " + platform);
        }
        return locator;
    }
}
