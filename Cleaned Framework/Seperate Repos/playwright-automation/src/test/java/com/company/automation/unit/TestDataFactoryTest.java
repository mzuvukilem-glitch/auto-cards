package com.company.automation.unit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.company.automation.data.LoginData;
import com.company.automation.data.TestDataFactory;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;

/**
 * Unit tests for typed test-data loading (JSON + CSV) and the {@link LoginData} record.
 *
 * <p>Runs single-threaded: the environment-override tests mutate the global {@code environment}
 * system property, which would otherwise race with the sibling data-loading assertions under
 * JUnit 5 parallel execution.
 */
@Tag("unit")
@Execution(ExecutionMode.SAME_THREAD)
class TestDataFactoryTest {

    @Test
    @DisplayName("JSON and CSV load to the same typed records")
    void jsonAndCsvAreEquivalent() {
        List<LoginData> json =
                TestDataFactory.loadList("testdata/loginData.json", LoginData.class);
        List<LoginData> csv = TestDataFactory.loadList("testdata/loginData.csv", LoginData.class);
        assertEquals(json, csv, "JSON and CSV should parse to identical records");
        assertEquals(3, json.size());
    }

    @Test
    @DisplayName("records carry typed fields incl. boolean")
    void typedFields() {
        List<LoginData> rows =
                TestDataFactory.loadList("testdata/loginData.json", LoginData.class);
        LoginData valid =
                rows.stream().filter(r -> r.scenario().equals("valid_login")).findFirst().orElseThrow();
        assertEquals("standard_user", valid.username());
        assertTrue(valid.expectSuccess());
        LoginData locked =
                rows.stream()
                        .filter(r -> r.scenario().equals("locked_out_user"))
                        .findFirst()
                        .orElseThrow();
        assertFalse(locked.expectSuccess());
    }

    @Test
    @DisplayName("single-record load works (first CSV row)")
    void loadSingle() {
        LoginData one = TestDataFactory.load("testdata/loginData.csv", LoginData.class);
        assertEquals("valid_login", one.scenario());
    }

    @Test
    @DisplayName("missing resource fails with a clear message")
    void missingResource() {
        IllegalStateException ex =
                assertThrows(
                        IllegalStateException.class,
                        () -> TestDataFactory.loadList("testdata/nope.json", LoginData.class));
        assertTrue(ex.getMessage().contains("nope.json"));
    }

    @Test
    @DisplayName("LoginData record equality / accessors")
    void recordSemantics() {
        LoginData a = new LoginData("s", "u", "p", true);
        LoginData b = new LoginData("s", "u", "p", true);
        assertEquals(a, b);
        assertEquals("u", a.username());
        assertEquals("p", a.password());
    }

    @Test
    @DisplayName("-Denvironment=staging loads the env-specific dataset (override)")
    void environmentOverride() {
        System.setProperty("environment", "staging");
        try {
            List<LoginData> rows =
                    TestDataFactory.loadList("testdata/loginData.json", LoginData.class);
            assertEquals(1, rows.size());
            assertEquals("staging_user", rows.get(0).username());
        } finally {
            System.clearProperty("environment");
        }
    }

    @Test
    @DisplayName("-Denvironment=staging also overrides CSV data (not just JSON)")
    void environmentOverrideCsv() {
        System.setProperty("environment", "staging");
        try {
            List<LoginData> rows =
                    TestDataFactory.loadList("testdata/loginData.csv", LoginData.class);
            assertEquals(1, rows.size());
            assertEquals("staging_user", rows.get(0).username());
        } finally {
            System.clearProperty("environment");
        }
    }

    @Test
    @DisplayName("env with no override folder falls back to the base dataset")
    void environmentFallback() {
        System.setProperty("environment", "qa"); // no testdata/qa/ folder exists
        try {
            List<LoginData> rows =
                    TestDataFactory.loadList("testdata/loginData.json", LoginData.class);
            assertEquals(3, rows.size(), "should fall back to the base 3-row dataset");
        } finally {
            System.clearProperty("environment");
        }
    }
}
