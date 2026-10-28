package com.company.automation.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Typed, immutable view of the framework configuration, bound by Spring Boot's {@code Binder} from
 * the layered property sources (system properties &gt; env overlay &gt; base file). This replaces
 * ad-hoc {@code ConfigReader.get("some.key")} string lookups with compile-time-safe accessors:
 *
 * <pre>
 * AutomationConfig cfg = ConfigProvider.config();
 * String url = cfg.appium().serverUrl();
 * boolean autostart = cfg.appium().autostart();
 * String farm = cfg.cloud().farm();
 * </pre>
 *
 * <p>Defaults mirror the historical {@code ConfigReader.get(key, default)} fallbacks, so behaviour
 * is unchanged whether a key is set in a file, overridden with {@code -Dkey=value}, or absent.
 * Credentials ({@code cloud.user} / {@code cloud.key} / {@code cloud.host}) are intentionally NOT
 * modelled here — they remain {@code Secrets}-resolved so they never land in a bound config object.
 */
@ConfigurationProperties
public record AutomationConfig(
        @DefaultValue("android") String platform,
        @DefaultValue("qa") String environment,
        @DefaultValue Appium appium,
        @DefaultValue Cloud cloud) {

    /** Appium-server settings ({@code appium.*}). */
    public record Appium(
            @DefaultValue("http://127.0.0.1:4723") String serverUrl,
            @DefaultValue("false") boolean autostart) {}

    /** Device-farm / cloud settings ({@code cloud.*} and {@code device.farm}). */
    public record Cloud(
            @DefaultValue("local") String farm,
            @DefaultValue("us-west-1") String region,
            @DefaultValue("ATom Mobile") String project,
            @DefaultValue("local-build") String build,
            @DefaultValue("") String app,
            @DefaultValue("") String host) {}
}
