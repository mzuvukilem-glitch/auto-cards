package com.company.automation.driver;

import com.company.automation.config.CapabilitiesBuilder;
import com.company.automation.config.ConfigReader;
import com.company.automation.constants.FrameworkConstants;
import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.ios.IOSDriver;
import org.openqa.selenium.Capabilities;

import java.net.MalformedURLException;
import java.net.URL;

/**
 * Creates the correct AppiumDriver for the requested platform and binds it
 * to the current thread via DriverManager.
 */
public final class DriverFactory {

    private DriverFactory() {
    }

    public static void initDriver(String platform) {
        try {
            URL serverUrl = new URL(ConfigReader.get(FrameworkConstants.KEY_SERVER_URL,
                    "http://127.0.0.1:4723"));
            Capabilities caps = CapabilitiesBuilder.build(platform);

            Platform resolved = Platform.from(platform);
            switch (resolved) {
                case ANDROID -> DriverManager.setDriver(new AndroidDriver(serverUrl, caps));
                case IOS -> DriverManager.setDriver(new IOSDriver(serverUrl, caps));
            }
            DriverManager.setPlatform(resolved);
        } catch (MalformedURLException e) {
            throw new IllegalStateException("Invalid Appium server URL", e);
        }
    }

    public static void quitDriver() {
        if (DriverManager.getDriver() != null) {
            DriverManager.getDriver().quit();
            DriverManager.unload();
        }
    }
}
