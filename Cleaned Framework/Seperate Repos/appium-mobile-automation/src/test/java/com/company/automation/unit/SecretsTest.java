package com.company.automation.unit;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.assertTrue;

import com.company.automation.config.Secrets;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

/**
 * Unit tests for {@link Secrets} resolution. Only the system-property path and the {@code require}
 * fail-fast are asserted deterministically (env vars / .env are environment-dependent).
 */
public class SecretsTest {

    private static final String KEY = "unit.secret.sample";

    @org.testng.annotations.BeforeMethod
    public void clearBefore() {
        System.clearProperty(KEY);
    }

    @AfterMethod
    public void clearProp() {
        System.clearProperty(KEY);
    }

    @Test(groups = "unit")
    public void systemPropertyWins() {
        System.setProperty(KEY, "  from-D  ");
        assertEquals(Secrets.get(KEY, "fallback"), "from-D", "value should be trimmed");
    }

    @Test(groups = "unit")
    public void defaultWhenUnset() {
        assertEquals(Secrets.get(KEY, "fallback"), "fallback");
    }

    @Test(groups = "unit")
    public void requireThrowsWithGuidance() {
        // A unique, never-set key so no sibling test can contaminate this assertion.
        String missing = "unit.secret.definitely.absent." + System.nanoTime();
        try {
            Secrets.require(missing);
            org.testng.Assert.fail("expected IllegalStateException for missing secret");
        } catch (IllegalStateException ex) {
            // Message names the key and how to provide it.
            assertTrue(ex.getMessage().contains(missing), ex.getMessage());
        }
    }

    @Test(groups = "unit")
    public void requireReturnsSystemProperty() {
        System.setProperty(KEY, "present");
        assertEquals(Secrets.require(KEY), "present");
    }
}
