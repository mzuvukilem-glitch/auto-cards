package com.company.automation.config;

import com.company.automation.constants.FrameworkConstants;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

/**
 * Loads and exposes values from config.properties.
 * Runtime system properties (e.g. -Dplatform=ios) override file values.
 */
public final class ConfigReader {

    private static final Properties PROPERTIES = new Properties();

    static {
        try (FileInputStream fis = new FileInputStream(FrameworkConstants.CONFIG_PATH)) {
            PROPERTIES.load(fis);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Unable to load config.properties at " + FrameworkConstants.CONFIG_PATH, e);
        }
    }

    private ConfigReader() {
    }

    public static String get(String key) {
        // System property wins so CI can override without editing files
        String override = System.getProperty(key);
        if (override != null && !override.isBlank()) {
            return override;
        }
        String value = PROPERTIES.getProperty(key);
        if (value == null) {
            throw new IllegalArgumentException("Missing config key: " + key);
        }
        return value.trim();
    }

    public static String get(String key, String defaultValue) {
        String override = System.getProperty(key);
        if (override != null && !override.isBlank()) {
            return override;
        }
        return PROPERTIES.getProperty(key, defaultValue).trim();
    }
}
