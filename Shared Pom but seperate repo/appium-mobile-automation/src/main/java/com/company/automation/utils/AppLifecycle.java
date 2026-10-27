package com.company.automation.utils;

import com.company.automation.driver.DriverManager;
import io.appium.java_client.AppiumDriver;
import java.time.Duration;
import java.util.Map;

/**
 * App lifecycle helpers (reset, background/foreground, install/remove, launch/terminate, deep
 * link). Implemented with the portable {@code mobile: *} commands via {@link
 * AppiumDriver#executeScript}, which work across Android and iOS and avoid coupling to concrete
 * driver convenience methods.
 *
 * <p>Pass the app's package/bundle id as {@code appId} (Android package name or iOS bundle id).
 */
public final class AppLifecycle {

    private AppLifecycle() {}

    private static AppiumDriver driver() {
        return DriverManager.getDriver();
    }

    /** Send the app to the background for {@code seconds}, then bring it back. */
    public static void background(int seconds) {
        driver().executeScript("mobile: backgroundApp", Map.of("seconds", seconds));
    }

    /** Terminate (force-stop) the app. */
    public static void terminate(String appId) {
        driver().executeScript("mobile: terminateApp", Map.of("appId", appId));
    }

    /** Activate (launch/bring to foreground) the app. */
    public static void activate(String appId) {
        driver().executeScript("mobile: activateApp", Map.of("appId", appId));
    }

    /** True if the app is installed. */
    public static boolean isInstalled(String appId) {
        Object r = driver().executeScript("mobile: isAppInstalled", Map.of("appId", appId));
        return Boolean.TRUE.equals(r);
    }

    /** Remove (uninstall) the app. */
    public static void remove(String appId) {
        driver().executeScript("mobile: removeApp", Map.of("appId", appId));
    }

    /** Install an app package already present on the device/host at {@code appPath}. */
    public static void install(String appPath) {
        driver().executeScript("mobile: installApp", Map.of("appPath", appPath));
    }

    /**
     * Reset app state to a clean start: terminate then activate. (A full reinstall is also possible
     * via {@link #remove} + {@link #install}.)
     */
    public static void reset(String appId) {
        terminate(appId);
        activate(appId);
    }

    /**
     * Open a deep link. On Android uses the mobile deep-link command; on iOS a deep link is driven
     * through {@code driver.get(url)} on the active session.
     */
    public static void deepLink(String url, String appId) {
        driver().executeScript("mobile: deepLink", Map.of("url", url, "package", appId));
    }

    /** Small helper to pause (e.g. between lifecycle transitions) without a hard sleep call. */
    public static void settle() {
        try {
            Thread.sleep(Duration.ofMillis(500).toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
