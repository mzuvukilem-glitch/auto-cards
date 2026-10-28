package com.company.automation.config;

/**
 * Backwards-compatible facade over {@link ConfigProvider}. The public API and semantics are
 * unchanged — existing call sites keep working — but configuration is now loaded (from the
 * classpath), layered and validated by Spring Boot's {@code Binder} underneath (see {@link
 * ConfigProvider} and the typed {@link PlaywrightConfig}).
 *
 * <p>Resolution precedence (highest wins): {@code -Dkey=value} &gt; {@code config.<env>.properties}
 * overlay &gt; {@code config.properties} base &gt; default passed to {@code get(key, default)}.
 *
 * <p>New code is encouraged to use the typed view instead of string keys, e.g.
 * {@code ConfigProvider.config().viewport().width()}.
 */
public final class ConfigReader {

    private ConfigReader() {}

    /** Required key — throws if unresolved (no default). */
    public static String get(String key) {
        String value = ConfigProvider.instance().resolve(key);
        if (value == null) {
            throw new IllegalArgumentException("Missing config key: " + key);
        }
        return value;
    }

    /** Key with a fallback default when unresolved. */
    public static String get(String key, String defaultValue) {
        String value = ConfigProvider.instance().resolve(key);
        return value == null ? defaultValue : value;
    }

    /** Boolean key via {@link Boolean#parseBoolean}; default when unresolved. */
    public static boolean getBoolean(String key, boolean defaultValue) {
        String value = ConfigProvider.instance().resolve(key);
        return value == null ? defaultValue : Boolean.parseBoolean(value.trim());
    }

    /** Int key; default when unresolved or unparseable. */
    public static int getInt(String key, int defaultValue) {
        String value = ConfigProvider.instance().resolve(key);
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
