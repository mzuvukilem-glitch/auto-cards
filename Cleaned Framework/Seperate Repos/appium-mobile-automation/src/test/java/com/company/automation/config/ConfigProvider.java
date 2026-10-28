package com.company.automation.config;

import com.company.automation.constants.FrameworkConstants;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySource;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * Spring-backed configuration core. Loads the base file and the active environment overlay, layers
 * JVM system properties on top (highest precedence), and exposes the result two ways:
 *
 * <ul>
 *   <li>{@link #resolve(String)} — raw dotted-key lookup used by the {@link ConfigReader} facade,
 *       preserving the historical precedence and trimming behaviour.
 *   <li>{@link #config()} — a typed, immutable {@link AutomationConfig} bound by Spring Boot's
 *       {@link Binder}, so new code can read {@code config().appium().serverUrl()} with
 *       compile-time safety instead of stringly-typed keys.
 * </ul>
 *
 * <p>Initialisation is lazy (first access) and runs the same fail-fast validation the previous
 * static {@code ConfigReader} did, so timing and error behaviour are unchanged.
 */
public final class ConfigProvider {

    private static volatile ConfigProvider instance;

    private final Map<String, String> merged; // base <- overlay (system props applied in resolve)
    private final AutomationConfig config;

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
    public static AutomationConfig config() {
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

    // ---- loading -----------------------------------------------------------

    private static Map<String, String> loadMerged() {
        Properties base = load(FrameworkConstants.CONFIG_PATH, true);

        Map<String, String> map = new LinkedHashMap<>();
        base.forEach((k, v) -> map.put(String.valueOf(k), String.valueOf(v)));

        // Environment overlay — same rules as before: an explicitly requested env MUST exist.
        boolean envExplicit =
                System.getProperty("environment") != null
                        && !System.getProperty("environment").isBlank();
        String env =
                System.getProperty("environment", base.getProperty("environment", "")).trim();
        if (!env.isBlank()) {
            String envFile =
                    FrameworkConstants.RESOURCES_PATH + "/config/config." + env + ".properties";
            if (new File(envFile).exists()) {
                Properties overlay = load(envFile, false);
                overlay.forEach((k, v) -> map.put(String.valueOf(k), String.valueOf(v)));
            } else if (envExplicit) {
                throw new IllegalStateException(
                        "Unknown environment '"
                                + env
                                + "': no overlay file config/config."
                                + env
                                + ".properties. Available: int, qa, staging, stress.");
            }
        }
        return map;
    }

    private static Properties load(String path, boolean required) {
        Properties props = new Properties();
        try (FileInputStream fis = new FileInputStream(path)) {
            props.load(fis);
        } catch (IOException e) {
            if (required) {
                throw new IllegalStateException("Unable to load config at " + path, e);
            }
        }
        return props;
    }

    // ---- validation (ported verbatim from the old ConfigReader) ------------

    private void validate() {
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

    // ---- typed binding -----------------------------------------------------

    private AutomationConfig bind() {
        // Build a property map for the Binder, applying system-property precedence and mapping the
        // legacy flat key device.farm -> cloud.farm so it binds into AutomationConfig.Cloud.
        Map<String, Object> source = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : merged.entrySet()) {
            source.put(e.getKey(), e.getValue());
        }
        System.getProperties()
                .forEach(
                        (k, v) -> {
                            String key = String.valueOf(k);
                            if (merged.containsKey(key) || key.startsWith("appium.")
                                    || key.startsWith("cloud.")
                                    || key.equals("device.farm")
                                    || key.equals("platform")
                                    || key.equals("environment")) {
                                source.put(key, v);
                            }
                        });
        // Alias legacy device.farm into the typed cloud.farm property.
        String farm = resolve("device.farm");
        if (farm != null) {
            source.put("cloud.farm", farm);
        }

        ConfigurationPropertySource cps = new MapConfigurationPropertySource(source);
        return new Binder(cps).bindOrCreate("", AutomationConfig.class);
    }
}
