package com.company.automation.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Typed, immutable view of the Playwright framework configuration, bound by Spring Boot's {@code
 * Binder} from the classpath property sources (system properties &gt; env overlay &gt; base file).
 * This replaces ad-hoc {@code ConfigReader.get("some.key")} string lookups with compile-time-safe
 * accessors:
 *
 * <pre>
 * PlaywrightConfig cfg = ConfigProvider.config();
 * String url   = cfg.baseUrl();
 * boolean head = cfg.browserOptions().headless();
 * int w        = cfg.viewport().width();
 * </pre>
 *
 * <p>Defaults mirror the historical {@code ConfigReader.get(key, default)} fallbacks, so behaviour
 * is unchanged whether a key is set in a file, overridden with {@code -Dkey=value}, or absent.
 * Secrets (e.g. {@code api.token}) are intentionally NOT modelled here — they remain
 * {@code Secrets}-resolved so they never land in a bound config object.
 *
 * <p>Several flat keys are remapped into these nested groups by {@link ConfigProvider} (e.g.
 * {@code slowmo.ms} &rarr; {@code browserOptions.slowmoMs}, {@code default.timeout} &rarr;
 * {@code timeouts.defaultMs}), so the property files keep their existing names.
 */
@ConfigurationProperties
public record PlaywrightConfig(
        @DefaultValue("") String baseUrl,
        @DefaultValue("chromium") String browser,
        @DefaultValue("qa") String environment,
        @DefaultValue("standard_user") String standardUser,
        @DefaultValue("secret_sauce") String standardPassword,
        @DefaultValue BrowserOptions browserOptions,
        @DefaultValue Viewport viewport,
        @DefaultValue Timeouts timeouts,
        @DefaultValue Api api,
        @DefaultValue("false") boolean recordVideo,
        @DefaultValue("false") boolean reuseAuth,
        @DefaultValue("50") int a11yViolationBudget) {

    /** The configured browser as a typed enum (chromium/firefox/webkit, with aliases). */
    public BrowserType browserType() {
        return BrowserType.from(browser);
    }

    /** Browser launch options ({@code headless}, {@code slowmo.ms}, {@code browser.channel}). */
    public record BrowserOptions(
            @DefaultValue("true") boolean headless,
            @DefaultValue("0") int slowmoMs,
            @DefaultValue("") String channel) {}

    /** Viewport size ({@code viewport.width} / {@code viewport.height}). */
    public record Viewport(
            @DefaultValue("1280") int width, @DefaultValue("720") int height) {}

    /** Default/navigation timeouts in ms ({@code default.timeout} / {@code navigation.timeout}). */
    public record Timeouts(
            @DefaultValue("15000") int defaultMs, @DefaultValue("30000") int navigationMs) {}

    /** API-testing settings ({@code api.base.url} / {@code api.timeout}). */
    public record Api(
            @DefaultValue("https://reqres.in") String baseUrl,
            @DefaultValue("30000") int timeout) {}
}
