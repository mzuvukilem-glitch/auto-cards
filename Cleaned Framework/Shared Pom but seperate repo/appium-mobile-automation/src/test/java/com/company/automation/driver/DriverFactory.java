package com.company.automation.driver;

import com.company.automation.config.CapabilitiesBuilder;
import com.company.automation.config.ConfigReader;
import com.company.automation.constants.FrameworkConstants;
import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.ios.IOSDriver;
import java.net.MalformedURLException;
import java.net.URL;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.Capabilities;

/**
 * Creates the correct AppiumDriver for the requested platform and binds it to the current thread
 * via DriverManager.
 */
public final class DriverFactory {

    private static final Logger log = LogManager.getLogger(DriverFactory.class);

    private DriverFactory() {}

    public static void initDriver(String platform) {
        try {
            String serverUrlValue =
                    ConfigReader.get(FrameworkConstants.KEY_SERVER_URL, "http://127.0.0.1:4723");
            URL serverUrl = new URL(serverUrlValue);
            Platform resolved = Platform.from(platform);
            log.info("Initialising {} driver against Appium server {}", resolved, serverUrlValue);

            Capabilities caps = CapabilitiesBuilder.build(platform);
            switch (resolved) {
                case ANDROID -> DriverManager.setDriver(new AndroidDriver(serverUrl, caps));
                case IOS -> DriverManager.setDriver(new IOSDriver(serverUrl, caps));
            }
            DriverManager.setPlatform(resolved);
            log.info("{} driver session started", resolved);
        } catch (MalformedURLException e) {
            throw new IllegalStateException("Invalid Appium server URL", e);
        }
    }

    public static void quitDriver() {
        if (DriverManager.getDriver() != null) {
            log.info("Quitting {} driver session", DriverManager.getPlatform());
            DriverManager.getDriver().quit();
            DriverManager.unload();
        }
    }
}
