package com.company.automation.unit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.company.automation.config.BrowserType;
import com.company.automation.config.ConfigProvider;
import com.company.automation.config.ConfigReader;
import com.company.automation.config.PlaywrightConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for the Spring-{@code Binder}-backed config: typed binding against the real
 * {@code config.properties}, and consistency with the {@link ConfigReader} facade. These assert
 * the default (qa) load — no {@code -D} overrides — so the lazily-bound singleton is deterministic.
 */
@Tag("unit")
class ConfigTest {

    @Test
    @DisplayName("typed config binds the base config.properties")
    void typedBinding() {
        PlaywrightConfig cfg = ConfigProvider.config();
        assertNotNull(cfg.baseUrl());
        assertTrue(cfg.baseUrl().startsWith("http"), "base.url should be a URL");
        assertEquals(BrowserType.CHROMIUM, cfg.browserType());
        assertEquals(1280, cfg.viewport().width());
        assertEquals(720, cfg.viewport().height());
        assertEquals(15000, cfg.timeouts().defaultMs());
        assertEquals(30000, cfg.timeouts().navigationMs());
        assertTrue(cfg.browserOptions().headless());
        assertEquals(0, cfg.browserOptions().slowmoMs());
    }

    @Test
    @DisplayName("facade getters agree with the typed view")
    void facadeConsistency() {
        PlaywrightConfig cfg = ConfigProvider.config();
        assertEquals(cfg.baseUrl(), ConfigReader.get("base.url"));
        assertEquals(cfg.browser(), ConfigReader.get("browser", "chromium"));
        assertEquals(cfg.viewport().width(), ConfigReader.getInt("viewport.width", 1));
        assertEquals(cfg.browserOptions().headless(), ConfigReader.getBoolean("headless", false));
        assertEquals(cfg.timeouts().defaultMs(), ConfigReader.getInt("default.timeout", 1));
    }

    @Test
    @DisplayName("getInt falls back to default on non-numeric value")
    void getIntFallback() {
        assertEquals(42, ConfigReader.getInt("browser", 42)); // "chromium" is not an int
    }

    @Test
    @DisplayName("get(key) with no default throws for an unknown key")
    void missingKeyThrows() {
        assertThrows(IllegalArgumentException.class, () -> ConfigReader.get("totally.unknown.key"));
    }

    @Test
    @DisplayName("api config binds from api.base.url (dotted sub-key alias)")
    void apiBinding() {
        assertTrue(ConfigProvider.config().api().baseUrl().startsWith("http"));
        assertEquals(30000, ConfigProvider.config().api().timeout());
    }
}
