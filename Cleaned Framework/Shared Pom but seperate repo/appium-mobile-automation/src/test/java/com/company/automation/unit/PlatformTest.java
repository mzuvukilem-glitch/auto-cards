package com.company.automation.unit;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertThrows;

import com.company.automation.driver.Platform;
import org.testng.annotations.Test;

/** Unit tests for {@link Platform#from(String)} — pure parsing, no device needed. */
public class PlatformTest {

    @Test(groups = "unit")
    public void parsesAndroid() {
        assertEquals(Platform.from("android"), Platform.ANDROID);
        assertEquals(Platform.from("ANDROID"), Platform.ANDROID);
        assertEquals(Platform.from("  Android  "), Platform.ANDROID);
    }

    @Test(groups = "unit")
    public void parsesIos() {
        assertEquals(Platform.from("ios"), Platform.IOS);
        assertEquals(Platform.from("iOS"), Platform.IOS);
    }

    @Test(groups = "unit")
    public void nullRejected() {
        assertThrows(IllegalArgumentException.class, () -> Platform.from(null));
    }

    @Test(groups = "unit")
    public void unknownRejected() {
        assertThrows(IllegalArgumentException.class, () -> Platform.from("windows-phone"));
    }
}
