package com.company.automation.unit;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.assertTrue;

import com.company.automation.config.CapabilitiesBuilder;
import org.openqa.selenium.Capabilities;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

/**
 * Unit tests for {@link CapabilitiesBuilder} that need no device. Capability objects are assembled
 * in-memory; farm-switching cloud paths (browserstack/saucelabs/etc.) are covered by integration
 * tests since they depend on the bound {@code device.farm} singleton and live credentials.
 */
public class CapabilitiesBuilderTest {

    @AfterMethod
    public void clearProps() {
        System.clearProperty("appium.server.url");
    }

    @Test(groups = "unit")
    public void buildsAndroidCaps() {
        Capabilities caps = CapabilitiesBuilder.build("android");
        assertNotNull(caps);
        // platformName is the W3C enum name (ANDROID), set via UiAutomator2Options.
        assertEquals(caps.getCapability("platformName").toString(), "ANDROID");
    }

    @Test(groups = "unit")
    public void buildsIosCaps() {
        Capabilities caps = CapabilitiesBuilder.build("ios");
        assertNotNull(caps);
        assertEquals(caps.getCapability("platformName").toString(), "IOS");
    }

    @Test(groups = "unit")
    public void unknownPlatformFailsBeforeBuilding() {
        // An unknown platform has no <platform>.properties file, so loading fails fast with an
        // IllegalStateException (before the platform switch is reached).
        assertThrows(RuntimeException.class, () -> CapabilitiesBuilder.build("blackberry"));
    }

    @Test(groups = "unit")
    public void explicitServerUrlOverrideWins() {
        // The explicit -Dappium.server.url branch returns before any farm logic, so this is
        // deterministic regardless of the bound device.farm.
        System.setProperty("appium.server.url", "http://grid.example:4723/wd/hub");
        String url = CapabilitiesBuilder.resolveServerUrl("android");
        assertEquals(url, "http://grid.example:4723/wd/hub");
    }

    @Test(groups = "unit")
    public void localServerUrlResolves() {
        // Default farm (local) → the configured/local server URL.
        String url = CapabilitiesBuilder.resolveServerUrl("android");
        assertTrue(url.startsWith("http"), "resolved url should be a URL: " + url);
    }
}
