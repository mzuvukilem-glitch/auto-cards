package com.company.automation.config;

/**
 * Backwards-compatible facade over {@link ConfigProvider}. The public API and semantics are
 * unchanged — existing call sites keep working — but configuration is now loaded, layered and
 * validated by Spring Boot's {@code Binder} underneath (see {@link ConfigProvider} and the typed
 * {@link AutomationConfig}).
 *
 * <p>Resolution precedence (highest wins):
 *
 * <pre>
 * 1. -Dkey=value         (JVM system property)
 * 2. config.&lt;env&gt;.properties  (when -Denvironment is set)
 * 3. config.properties   (base)
 * 4. default passed to get(key, default)
 * </pre>
 *
 * <p>New code is encouraged to use the typed view instead of string keys:
 * {@code ConfigProvider.config().appium().serverUrl()}.
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
        return value == null ? defaultValue : Boolean.parseBoolean(value);
    }

    /** Int key; default when unresolved or unparseable. */
    public static int getInt(String key, int defaultValue) {
        String value = ConfigProvider.instance().resolve(key);
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
