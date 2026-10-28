package com.company.automation.unit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.company.automation.config.BrowserType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Unit tests for {@link BrowserType#from(String)} — pure parsing, no browser needed. */
@Tag("unit")
class BrowserTypeTest {

    @ParameterizedTest(name = "\"{0}\" -> {1}")
    @CsvSource({
        "chromium, CHROMIUM",
        "chrome, CHROMIUM",
        "CHROMIUM, CHROMIUM",
        "firefox, FIREFOX",
        "Firefox, FIREFOX",
        "webkit, WEBKIT",
        "safari, WEBKIT",
        "  chromium  , CHROMIUM"
    })
    @DisplayName("maps names and aliases (case/space-insensitive)")
    void parsesNamesAndAliases(String input, BrowserType expected) {
        assertEquals(expected, BrowserType.from(input));
    }

    @Test
    @DisplayName("null is rejected")
    void nullRejected() {
        assertThrows(IllegalArgumentException.class, () -> BrowserType.from(null));
    }

    @Test
    @DisplayName("unknown value is rejected")
    void unknownRejected() {
        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> BrowserType.from("netscape"));
        assertEquals("Unsupported browser: netscape", ex.getMessage());
    }
}
