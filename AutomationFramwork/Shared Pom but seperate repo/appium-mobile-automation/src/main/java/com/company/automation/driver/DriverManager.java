package com.company.automation.driver;

import io.appium.java_client.AppiumDriver;

/**
 * Thread-safe holder for the AppiumDriver and its platform, so suites can run in parallel (one
 * driver + platform per test thread).
 */
public final class DriverManager {

    private static final ThreadLocal<AppiumDriver> DRIVER = new ThreadLocal<>();
    private static final ThreadLocal<Platform> PLATFORM = new ThreadLocal<>();

    private DriverManager() {}

    public static AppiumDriver getDriver() {
        AppiumDriver driver = DRIVER.get();
        if (driver == null) {
            throw new IllegalStateException(
                    "Driver not initialised for this thread. Call DriverFactory.initDriver first.");
        }
        return driver;
    }

    public static void setDriver(AppiumDriver driver) {
        DRIVER.set(driver);
    }

    public static Platform getPlatform() {
        Platform platform = PLATFORM.get();
        if (platform == null) {
            throw new IllegalStateException(
                    "Platform not set for this thread. Call DriverFactory.initDriver first.");
        }
        return platform;
    }

    public static void setPlatform(Platform platform) {
        PLATFORM.set(platform);
    }

    public static void unload() {
        DRIVER.remove();
        PLATFORM.remove();
    }
}
