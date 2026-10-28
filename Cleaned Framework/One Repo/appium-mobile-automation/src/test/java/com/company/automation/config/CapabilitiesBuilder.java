package com.company.automation.config;

import com.company.automation.commons.Secrets;
import com.company.automation.constants.FrameworkConstants;
import io.appium.java_client.android.options.UiAutomator2Options;
import io.appium.java_client.ios.options.XCUITestOptions;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import org.openqa.selenium.Capabilities;
import org.openqa.selenium.MutableCapabilities;

/**
 * Builds platform-specific W3C capabilities from the per-platform properties files
 * (android.properties / ios.properties), then layers on device-cloud vendor capabilities when
 * {@code device.farm} selects a cloud.
 *
 * <p>Targets are driven by {@code device.farm}:
 *
 * <ul>
 *   <li>{@code local} (default) — a local emulator/simulator or real device via a local Appium
 *       server. Capabilities are returned unchanged.
 *   <li>{@code browserstack}, {@code saucelabs}, {@code lambdatest}, {@code awsdevicefarm},
 *       {@code perfecto} — the vendor capability block is added and the hub URL is auto-derived
 *       (see {@link #resolveServerUrl(String)}).
 * </ul>
 *
 * <p>Cloud credentials come from {@link Secrets} (never hard-coded): {@code cloud.user} /
 * {@code cloud.key}. An uploaded-app reference can be supplied with {@code cloud.app} (e.g.
 * {@code bs://...}, {@code storage:...}, {@code lt://...}); otherwise the local {@code appFile}
 * under {@code src/test/resources/apps/} is used.
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
     * Resolves the Appium server URL for the current {@code device.farm}. An explicit
     * {@code -Dappium.server.url} / config entry always wins; otherwise a cloud farm returns its
     * known hub URL and {@code local} returns the configured local server (default
     * {@code http://127.0.0.1:4723}). This lets a cloud run be a single flag
     * ({@code -Ddevice.farm=browserstack}) plus credentials, with no separate URL to remember.
     */
    public static String resolveServerUrl(String platform) {
        // An explicit server URL (system property or config entry) always takes precedence.
        String explicit = System.getProperty("appium.server.url");
        if (explicit != null && !explicit.isBlank()) {
            return explicit.trim();
        }

        String farm = farm();
        return switch (farm) {
            case "local" -> appium().serverUrl();
            case "browserstack" -> "https://hub-cloud.browserstack.com/wd/hub";
            case "saucelabs" ->
                    "https://ondemand." + cloud().region() + ".saucelabs.com/wd/hub";
            case "lambdatest" -> "https://mobile-hub.lambdatest.com/wd/hub";
            case "awsdevicefarm" ->
                    // AWS Device Farm issues a signed, per-run grid URL; it must be supplied.
                    requireServerUrlFor("awsdevicefarm");
            case "perfecto" ->
                    "https://"
                            + Secrets.require("cloud.host")
                            + ".perfectomobile.com/nexperience/perfectomobile/wd/hub";
            default -> throw new IllegalArgumentException("Unsupported device.farm: " + farm);
        };
    }

    /**
     * Applies device-cloud vendor capabilities when {@code device.farm} is a cloud. For
     * {@code local} (default) the capabilities are returned unchanged.
     */
    private static Capabilities applyDeviceFarm(Capabilities caps, String platform) {
        String farm = farm();
        if (farm.equals("local")) {
            return caps;
        }
        MutableCapabilities mutable = new MutableCapabilities(caps);
        switch (farm) {
            case "browserstack" -> {
                // BrowserStack reads credentials + run metadata from a bstack:options map.
                Map<String, Object> bstack = new HashMap<>();
                bstack.put("userName", Secrets.require("cloud.user"));
                bstack.put("accessKey", Secrets.require("cloud.key"));
                bstack.put("projectName", cloud().project());
                bstack.put("buildName", cloud().build());
                bstack.put("sessionName", platform + " session");
                mutable.setCapability("bstack:options", bstack);
            }
            case "saucelabs" -> {
                Map<String, Object> sauce = new HashMap<>();
                sauce.put("username", Secrets.require("cloud.user"));
                sauce.put("accessKey", Secrets.require("cloud.key"));
                sauce.put("build", cloud().build());
                mutable.setCapability("sauce:options", sauce);
            }
            case "lambdatest" -> {
                // LambdaTest reads credentials + run metadata from an lt:options map.
                Map<String, Object> lt = new HashMap<>();
                lt.put("username", Secrets.require("cloud.user"));
                lt.put("accessKey", Secrets.require("cloud.key"));
                lt.put("project", cloud().project());
                lt.put("build", cloud().build());
                lt.put("w3c", true);
                lt.put("isRealMobile", true);
                mutable.setCapability("lt:options", lt);
            }
            case "awsdevicefarm" -> {
                // AWS Device Farm authenticates via the signed grid URL (see resolveServerUrl);
                // no per-session credentials go in the capabilities.
                Secrets.require("cloud.user"); // ensure AWS creds exist for the URL-signing step
            }
            case "perfecto" -> {
                // Perfecto reads a security token from perfecto:options.
                Map<String, Object> perfecto = new HashMap<>();
                perfecto.put("securityToken", Secrets.require("cloud.key"));
                mutable.setCapability("perfecto:options", perfecto);
            }
            default -> throw new IllegalArgumentException("Unsupported device.farm: " + farm);
        }
        return mutable;
    }

    private static UiAutomator2Options android(Properties p) {
        UiAutomator2Options options = new UiAutomator2Options();
        options.setDeviceName(p.getProperty("deviceName", "Android Emulator"));
        options.setPlatformName("Android");
        options.setApp(resolveApp(p));
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
        options.setApp(resolveApp(p));
        options.setAutomationName("XCUITest");
        options.setNewCommandTimeout(java.time.Duration.ofSeconds(120));
        return options;
    }

    /**
     * Resolves the app under test. On a cloud run you can pass a vendor-uploaded app reference
     * with {@code -Dcloud.app=bs://...|storage:...|lt://...}; otherwise the local {@code appFile}
     * under {@code src/test/resources/apps/} is used.
     */
    private static String resolveApp(Properties p) {
        String cloudApp = cloud().app();
        if (cloudApp != null && !cloudApp.isBlank()) {
            return cloudApp;
        }
        return FrameworkConstants.APPS_PATH + "/" + p.getProperty("appFile");
    }

    /** Typed config shortcuts (Spring-bound; see {@link AutomationConfig}). */
    private static AutomationConfig.Cloud cloud() {
        return ConfigProvider.config().cloud();
    }

    private static AutomationConfig.Appium appium() {
        return ConfigProvider.config().appium();
    }

    /** Current device farm, normalised. */
    private static String farm() {
        return cloud().farm().toLowerCase().trim();
    }

    private static String requireServerUrlFor(String farm) {
        // The signed grid URL is per-run and must be supplied explicitly via -Dappium.server.url
        // (it never belongs in the committed config file, which always defines a local default).
        // So require the SYSTEM PROPERTY specifically rather than the merged config value.
        String url = System.getProperty("appium.server.url", "");
        if (url.isBlank()) {
            throw new IllegalStateException(
                    "device.farm="
                            + farm
                            + " requires an explicit appium.server.url (the signed grid/hub URL). "
                            + "Provide it with -Dappium.server.url=...");
        }
        return url.trim();
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
