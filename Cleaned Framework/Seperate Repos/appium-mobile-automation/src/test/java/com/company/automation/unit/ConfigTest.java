package com.company.automation.unit;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.assertTrue;

import com.company.automation.config.ConfigProvider;
import com.company.automation.config.ConfigReader;
import com.company.automation.config.AutomationConfig;
import org.testng.annotations.Test;

/**
 * Unit tests for the Spring-{@code Binder}-backed config: typed binding against the real
 * {@code config/config.properties}, and consistency with the {@link ConfigReader} facade. Assert
 * the default load (no {@code -D} overrides) so the lazily-bound singleton is deterministic.
 */
public class ConfigTest {

    @Test(groups = "unit")
    public void typedBinding() {
        AutomationConfig cfg = ConfigProvider.config();
        assertEquals(cfg.platform(), "android");
        assertNotNull(cfg.appium().serverUrl());
        assertTrue(cfg.appium().serverUrl().startsWith("http"));
        assertEquals(cfg.cloud().farm(), "local");
        assertEquals(cfg.cloud().region(), "us-west-1");
        assertEquals(cfg.cloud().project(), "ATom Mobile");
    }

    @Test(groups = "unit")
    public void facadeConsistency() {
        // Uses keys no other test mutates via -D (appium.server.url is intentionally avoided,
        // as a sibling test sets it as a system property to exercise the override path).
        AutomationConfig cfg = ConfigProvider.config();
        assertEquals(ConfigReader.get("platform", "x"), cfg.platform());
        assertEquals(ConfigReader.get("device.farm", "x"), cfg.cloud().farm());
        assertEquals(ConfigReader.get("cloud.region", "x"), cfg.cloud().region());
        assertEquals(
                ConfigReader.getBoolean("appium.server.autostart", true),
                cfg.appium().autostart());
    }

    @Test(groups = "unit")
    public void getIntFallbackOnNonNumeric() {
        assertEquals(ConfigReader.getInt("platform", 7), 7); // "android" isn't an int
    }

    @Test(groups = "unit")
    public void missingKeyThrows() {
        assertThrows(IllegalArgumentException.class, () -> ConfigReader.get("no.such.key"));
    }
}
