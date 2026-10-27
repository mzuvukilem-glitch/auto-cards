package com.company.automation.config;

import com.company.automation.constants.FrameworkConstants;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

/**
 * Loads and exposes framework configuration with layered precedence:
 *
 * <pre>
 * 1. -Dkey=value         (JVM system property)            ← highest
 * 2. config.&lt;env&gt;.properties  (when -Denvironment is set)
 * 3. config.properties   (base)
 * 4. default passed to get(key, default)                  ← lowest
 * </pre>
 *
 * The environment is chosen by {@code -Denvironment=qa|staging|prod} (default from the base file).
 * This lets one build run against multiple environments without editing files.
 */
public final class ConfigReader {

    private static final Properties PROPERTIES = new Properties();

    static {
        // 1) Base config
        load(FrameworkConstants.CONFIG_PATH, true);

        // 2) Environment overlay: config.<env>.properties (e.g. int, qa, staging, stress).
        //    When -Denvironment is set explicitly, the overlay MUST exist — otherwise we fail
        //    fast rather than silently run against the base/default target.
        boolean envExplicit =
                System.getProperty("environment") != null
                        && !System.getProperty("environment").isBlank();
        String env =
                System.getProperty("environment", PROPERTIES.getProperty("environment", "")).trim();
        if (!env.isBlank()) {
            String envFile =
                    FrameworkConstants.RESOURCES_PATH + "/config/config." + env + ".properties";
            if (new File(envFile).exists()) {
                load(envFile, false); // overlay — overrides matching base keys
            } else if (envExplicit) {
                throw new IllegalStateException(
                        "Unknown environment '"
                                + env
                                + "': no overlay file config/config."
                                + env
                                + ".properties. Available: int, qa, staging, stress.");
            }
        }

        // 3) Fail fast on obviously invalid configuration.
        validate();
    }

    /**
     * Validates required keys and value ranges at load time, so a typo or missing value fails
     * immediately with a clear message rather than mid-test.
     */
    private static void validate() {
        String url = resolve("appium.server.url");
        if (url == null || url.isBlank()) {
            throw new IllegalStateException(
                    "Invalid configuration: required key 'appium.server.url' is missing.");
        }
        try {
            new java.net.URI(url).toURL();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Invalid configuration: 'appium.server.url' is not a valid URL: " + url, e);
        }
    }

    private ConfigReader() {}

    private static void load(String path, boolean required) {
        try (FileInputStream fis = new FileInputStream(path)) {
            PROPERTIES.load(fis);
        } catch (IOException e) {
            if (required) {
                throw new IllegalStateException("Unable to load config at " + path, e);
            }
        }
    }

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
        return value == null ? defaultValue : Boolean.parseBoolean(value);
    }

    public static int getInt(String key, int defaultValue) {
        String value = resolve(key);
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private static String resolve(String key) {
        // System property wins so CI can override without editing files
        String override = System.getProperty(key);
        if (override != null && !override.isBlank()) {
            return override.trim();
        }
        String value = PROPERTIES.getProperty(key);
        return value == null ? null : value.trim();
    }
}
