package com.company.automation.config;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySource;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * Spring-backed configuration core for the Playwright framework. Loads the base
 * {@code config.properties} and the active {@code config.<env>.properties} overlay from the
 * classpath, layers JVM system properties on top (highest precedence), and exposes the result two
 * ways:
 *
 * <ul>
 *   <li>{@link #resolve(String)} — raw dotted-key lookup used by the {@link ConfigReader} facade,
 *       preserving the historical precedence and trimming behaviour.
 *   <li>{@link #config()} — a typed, immutable {@link PlaywrightConfig} bound by Spring Boot's
 *       {@link Binder}, so new code can read {@code config().viewport().width()} with compile-time
 *       safety instead of stringly-typed keys.
 * </ul>
 *
 * <p>Initialisation is lazy (first access) and runs the same fail-fast validation the previous
 * static {@code ConfigReader} did, so timing and error behaviour are unchanged.
 */
public final class ConfigProvider {

    private static final Set<String> ALLOWED_BROWSERS =
            Set.of("chromium", "chrome", "firefox", "webkit", "safari");

    private static volatile ConfigProvider instance;

    private final Map<String, String> merged;
    private final PlaywrightConfig config;

    private ConfigProvider() {
        this.merged = loadMerged();
        validate();
        this.config = bind();
    }

    /** Lazily-initialised singleton; first touch loads + validates, mirroring the old static init. */
    public static ConfigProvider instance() {
        ConfigProvider local = instance;
        if (local == null) {
            synchronized (ConfigProvider.class) {
                local = instance;
                if (local == null) {
                    local = new ConfigProvider();
                    instance = local;
                }
            }
        }
        return local;
    }

    /** Typed, bound configuration. */
    public static PlaywrightConfig config() {
        return instance().config;
    }

    /**
     * Resolves a raw key with precedence: system property &gt; overlay &gt; base. Returns {@code
     * null} if unset. Values are trimmed. Used by the {@link ConfigReader} facade.
     */
    public String resolve(String key) {
        String sys = System.getProperty(key);
        if (sys != null && !sys.isBlank()) {
            return sys.trim();
        }
        String value = merged.get(key);
        return value == null ? null : value.trim();
    }

    // ---- loading (classpath) ----------------------------------------------

    private static Map<String, String> loadMerged() {
        Properties base = loadResource("config.properties", true);

        Map<String, String> map = new LinkedHashMap<>();
        base.forEach((k, v) -> map.put(String.valueOf(k), String.valueOf(v)));

        boolean envExplicit =
                System.getProperty("environment") != null
                        && !System.getProperty("environment").isBlank();
        String env =
                System.getProperty("environment", base.getProperty("environment", "")).trim();
        if (!env.isBlank()) {
            String overlay = "config." + env + ".properties";
            boolean present = ConfigProvider.class.getClassLoader().getResource(overlay) != null;
            if (present) {
                Properties o = loadResource(overlay, false);
                o.forEach((k, v) -> map.put(String.valueOf(k), String.valueOf(v)));
            } else if (envExplicit) {
                throw new IllegalStateException(
                        "Unknown environment '"
                                + env
                                + "': no overlay resource "
                                + overlay
                                + " on the classpath. Available: int, qa, staging, stress.");
            }
        }
        return map;
    }

    private static Properties loadResource(String name, boolean required) {
        Properties props = new Properties();
        try (InputStream in = ConfigProvider.class.getClassLoader().getResourceAsStream(name)) {
            if (in == null) {
                if (required) {
                    throw new IllegalStateException(name + " not found on classpath");
                }
                return props;
            }
            props.load(in);
        } catch (IOException e) {
            throw new UncheckedIOException("Unable to load " + name, e);
        }
        return props;
    }

    // ---- validation (ported verbatim from the old ConfigReader) ------------

    private void validate() {
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
        if (browser != null && !ALLOWED_BROWSERS.contains(browser.toLowerCase())) {
            throw new IllegalStateException(
                    "Invalid configuration: 'browser' must be chromium|firefox|webkit, got: "
                            + browser);
        }
    }

    // ---- typed binding -----------------------------------------------------

    private PlaywrightConfig bind() {
        Map<String, Object> source = new LinkedHashMap<>();

        // Start from merged file values, then overlay system properties (precedence).
        merged.forEach(source::put);
        System.getProperties()
                .forEach(
                        (k, v) -> {
                            String key = String.valueOf(k);
                            if (merged.containsKey(key)
                                    || key.startsWith("viewport.")
                                    || key.startsWith("api.")
                                    || isKnownFlatKey(key)) {
                                source.put(key, v);
                            }
                        });

        // Map the record's top-level relaxed names.
        putIfResolved(source, "base.url", "baseurl"); // baseUrl relaxed
        // Alias flat legacy keys into the nested record groups.
        putIfResolved(source, "browser.channel", "browseroptions.channel");
        putIfResolved(source, "headless", "browseroptions.headless");
        putIfResolved(source, "slowmo.ms", "browseroptions.slowmoms");
        putIfResolved(source, "default.timeout", "timeouts.defaultms");
        putIfResolved(source, "navigation.timeout", "timeouts.navigationms");
        putIfResolved(source, "record.video", "recordvideo");
        putIfResolved(source, "reuse.auth", "reuseauth");
        putIfResolved(source, "a11y.violation.budget", "a11yviolationbudget");
        putIfResolved(source, "standard.user", "standarduser");
        putIfResolved(source, "standard.password", "standardpassword");
        // api.base.url is a dotted sub-key that relaxed binding treats as api.base.url
        // (base -> url), NOT the camelCase api.baseUrl field — alias it explicitly.
        putIfResolved(source, "api.base.url", "api.baseurl");
        // viewport.width/height and api.timeout already match nested names via relaxed binding.

        ConfigurationPropertySource cps = new MapConfigurationPropertySource(source);
        return new Binder(cps).bindOrCreate("", PlaywrightConfig.class);
    }

    private void putIfResolved(Map<String, Object> source, String rawKey, String targetKey) {
        String v = resolve(rawKey);
        if (v != null) {
            source.put(targetKey, v);
        }
    }

    private static boolean isKnownFlatKey(String key) {
        return key.equals("base.url")
                || key.equals("browser")
                || key.equals("browser.channel")
                || key.equals("headless")
                || key.equals("slowmo.ms")
                || key.equals("record.video")
                || key.equals("reuse.auth")
                || key.equals("default.timeout")
                || key.equals("navigation.timeout")
                || key.equals("environment")
                || key.equals("standard.user")
                || key.equals("standard.password")
                || key.equals("a11y.violation.budget");
    }
}
