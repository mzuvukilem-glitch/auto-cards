package com.company.automation.config;

import com.company.automation.constants.FrameworkConstants;
import io.appium.java_client.android.options.UiAutomator2Options;
import io.appium.java_client.ios.options.XCUITestOptions;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;
import org.openqa.selenium.Capabilities;

/**
 * Builds platform-specific W3C capabilities from the per-platform properties files
 * (android.properties / ios.properties).
 */
public final class CapabilitiesBuilder {

    private CapabilitiesBuilder() {}

    public static Capabilities build(String platform) {
        Properties props = loadPlatformProps(platform);
        Capabilities base =
                switch (platform.toLowerCase()) {
                    case "android" -> android(props);
                    case "ios" -> ios(props);
                    default ->
                            throw new IllegalArgumentException("Unsupported platform: " + platform);
                };
        return applyDeviceFarm(base, platform);
    }

    /**
     * Applies device-cloud vendor capabilities when {@code device.farm} is set (e.g. {@code
     * -Ddevice.farm=browserstack}). For {@code local} (default) the capabilities are returned
     * unchanged. Credentials come from config/-D (never hard-coded): {@code cloud.user} / {@code
     * cloud.key}.
     */
    private static Capabilities applyDeviceFarm(Capabilities caps, String platform) {
        String farm = ConfigReader.get("device.farm", "local").toLowerCase();
        if (farm.equals("local")) {
            return caps;
        }
        org.openqa.selenium.MutableCapabilities mutable =
                new org.openqa.selenium.MutableCapabilities(caps);
        switch (farm) {
            case "browserstack" -> {
                // BrowserStack reads credentials + run metadata from a bstack:options map.
                // Credentials are mandatory for a cloud run — fail fast if absent.
                java.util.Map<String, Object> bstack = new java.util.HashMap<>();
                bstack.put("userName", Secrets.require("cloud.user"));
                bstack.put("accessKey", Secrets.require("cloud.key"));
                bstack.put("projectName", ConfigReader.get("cloud.project", "ATom Mobile"));
                bstack.put("buildName", ConfigReader.get("cloud.build", "local-build"));
                bstack.put("sessionName", platform + " session");
                mutable.setCapability("bstack:options", bstack);
            }
            case "saucelabs" -> {
                java.util.Map<String, Object> sauce = new java.util.HashMap<>();
                sauce.put("username", Secrets.require("cloud.user"));
                sauce.put("accessKey", Secrets.require("cloud.key"));
                sauce.put("build", ConfigReader.get("cloud.build", "local-build"));
                mutable.setCapability("sauce:options", sauce);
            }
            default -> throw new IllegalArgumentException("Unsupported device.farm: " + farm);
        }
        return mutable;
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
        String file =
                FrameworkConstants.RESOURCES_PATH
                        + "/config/"
                        + platform.toLowerCase()
                        + ".properties";
        Properties props = new Properties();
        try (FileInputStream fis = new FileInputStream(file)) {
            props.load(fis);
        } catch (IOException e) {
            throw new IllegalStateException("Unable to load platform properties: " + file, e);
        }
        return props;
    }
}
