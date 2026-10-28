package com.company.automation.config;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Properties;

/**
 * Loads and exposes values from config.properties (on the classpath). A matching {@code
 * -Dkey=value} system property always overrides the file, so CI can change behaviour without
 * editing files.
 */
public final class ConfigReader {

    private static final Properties PROPERTIES = new Properties();

    static {
        // 1) Base config (required)
        loadResource("config.properties", true);

        // 2) Environment overlay (optional): config.<env>.properties on the classpath.
        //    Selected by -Denvironment=qa|staging|prod (or the base file's value).
        String env =
                System.getProperty("environment", PROPERTIES.getProperty("environment", "")).trim();
        if (!env.isBlank()) {
            loadResource(
                    "config." + env + ".properties", false); // overlay — overrides matching keys
        }

        // 3) Fail fast on obviously invalid configuration.
        validate();
    }

    /**
     * Validates required keys and value ranges at load time, so a typo or missing value fails
     * immediately with a clear message rather than mid-test.
     */
    private static void validate() {
        String baseUrl = resolve("base.url");
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalStateException(
                    "Invalid configuration: required key 'base.url' is missing.");
        }
        try {
            new java.net.URI(baseUrl).toURL();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Invalid configuration: 'base.url' is not a valid URL: " + baseUrl, e);
        }
        String browser = resolve("browser");
        if (browser != null
                && !java.util.Set.of("chromium", "chrome", "firefox", "webkit", "safari")
                        .contains(browser.toLowerCase())) {
            throw new IllegalStateException(
                    "Invalid configuration: 'browser' must be chromium|firefox|webkit, got: "
                            + browser);
        }
    }

    private static void loadResource(String name, boolean required) {
        try (InputStream in = ConfigReader.class.getClassLoader().getResourceAsStream(name)) {
            if (in == null) {
                if (required) {
                    throw new IllegalStateException(name + " not found on classpath");
                }
                return;
            }
            PROPERTIES.load(in);
        } catch (IOException e) {
            throw new UncheckedIOException("Unable to load " + name, e);
        }
    }

    private ConfigReader() {}

    public static String get(String key) {
        String value = resolve(key);
        if (value == null) {
            throw new IllegalArgumentException("Missing config key: " + key);
        }
        return value;
    }

    public static String get(String key, String defaultValue) {
        String value = resolve(key);
        return value == null ? defaultValue : value;
    }

    public static boolean getBoolean(String key, boolean defaultValue) {
        String value = resolve(key);
        return value == null ? defaultValue : Boolean.parseBoolean(value.trim());
    }

    public static int getInt(String key, int defaultValue) {
        String value = resolve(key);
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private static String resolve(String key) {
        String override = System.getProperty(key);
        if (override != null && !override.isBlank()) {
            return override.trim();
        }
        String value = PROPERTIES.getProperty(key);
        return value == null ? null : value.trim();
    }
}
