package com.company.automation.config;

import com.company.automation.constants.FrameworkConstants;
import io.appium.java_client.android.options.UiAutomator2Options;
import io.appium.java_client.ios.options.XCUITestOptions;
import org.openqa.selenium.Capabilities;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

/**
 * Builds platform-specific W3C capabilities from the per-platform
 * properties files (android.properties / ios.properties).
 */
public final class CapabilitiesBuilder {

    private CapabilitiesBuilder() {
    }

    public static Capabilities build(String platform) {
        Properties props = loadPlatformProps(platform);
        return switch (platform.toLowerCase()) {
            case "android" -> android(props);
            case "ios" -> ios(props);
            default -> throw new IllegalArgumentException("Unsupported platform: " + platform);
        };
    }

    private static UiAutomator2Options android(Properties p) {
        UiAutomator2Options options = new UiAutomator2Options();
        options.setDeviceName(p.getProperty("deviceName", "Android Emulator"));
        options.setPlatformName("Android");
        options.setApp(FrameworkConstants.APPS_PATH + "/" + p.getProperty("appFile"));
        options.setAutomationName("UiAutomator2");
        options.setAppWaitActivity(p.getProperty("appWaitActivity", "*"));
        options.setNewCommandTimeout(java.time.Duration.ofSeconds(120));
        return options;
    }

    private static XCUITestOptions ios(Properties p) {
        XCUITestOptions options = new XCUITestOptions();
        options.setDeviceName(p.getProperty("deviceName", "iPhone 15"));
        options.setPlatformName("iOS");
        options.setPlatformVersion(p.getProperty("platformVersion", "17.0"));
        options.setApp(FrameworkConstants.APPS_PATH + "/" + p.getProperty("appFile"));
        options.setAutomationName("XCUITest");
        options.setNewCommandTimeout(java.time.Duration.ofSeconds(120));
        return options;
    }

    private static Properties loadPlatformProps(String platform) {
        String file = FrameworkConstants.RESOURCES_PATH + "/config/" + platform.toLowerCase() + ".properties";
        Properties props = new Properties();
        try (FileInputStream fis = new FileInputStream(file)) {
            props.load(fis);
        } catch (IOException e) {
            throw new IllegalStateException("Unable to load platform properties: " + file, e);
        }
        return props;
    }
}
