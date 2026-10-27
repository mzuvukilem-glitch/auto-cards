package com.company.automation.config;

import java.io.InputStream;
import java.io.UncheckedIOException;
import java.io.IOException;
import java.util.Properties;

/**
 * Loads and exposes values from config.properties (on the classpath).
 * A matching {@code -Dkey=value} system property always overrides the file,
 * so CI can change behaviour without editing files.
 */
public final class ConfigReader {

    private static final Properties PROPERTIES = new Properties();

    static {
        try (InputStream in = ConfigReader.class.getClassLoader()
                .getResourceAsStream("config.properties")) {
            if (in == null) {
                throw new IllegalStateException("config.properties not found on classpath");
            }
            PROPERTIES.load(in);
        } catch (IOException e) {
            throw new UncheckedIOException("Unable to load config.properties", e);
        }
    }

    private ConfigReader() {
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
