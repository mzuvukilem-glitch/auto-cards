package com.company.automation.unit;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import com.company.automation.data.TestDataFactory;
import com.company.automation.data.UserData;
import java.util.List;
import org.testng.annotations.Test;

/** Unit tests for typed test-data loading (JSON + CSV) and the {@link UserData} record. */
public class TestDataFactoryTest {

    @Test(groups = "unit")
    public void jsonAndCsvAreEquivalent() {
        List<UserData> json = TestDataFactory.loadList("loginData.json", UserData.class);
        List<UserData> csv = TestDataFactory.loadList("loginData.csv", UserData.class);
        assertEquals(csv, json, "JSON and CSV should parse to identical records");
        assertEquals(json.size(), 3);
    }

    @Test(groups = "unit")
    public void typedFields() {
        List<UserData> rows = TestDataFactory.loadList("loginData.json", UserData.class);
        UserData valid =
                rows.stream()
                        .filter(r -> r.scenario().equals("valid_login"))
                        .findFirst()
                        .orElseThrow();
        assertEquals(valid.username(), "standard_user");
        assertTrue(valid.expectHome());
        UserData invalid =
                rows.stream()
                        .filter(r -> r.scenario().equals("invalid_password"))
                        .findFirst()
                        .orElseThrow();
        assertFalse(invalid.expectHome());
    }

    @Test(groups = "unit")
    public void loadSingle() {
        UserData one = TestDataFactory.load("loginData.csv", UserData.class);
        assertEquals(one.scenario(), "valid_login");
    }

    @Test(groups = "unit")
    public void recordSemantics() {
        UserData a = new UserData("s", "u", "p", true);
        UserData b = new UserData("s", "u", "p", true);
        assertEquals(b, a);
        assertEquals(a.password(), "p");
    }

    @Test(groups = "unit")
    public void environmentOverride() {
        System.setProperty("environment", "staging");
        try {
            List<UserData> rows = TestDataFactory.loadList("loginData.json", UserData.class);
            assertEquals(rows.size(), 1);
            assertEquals(rows.get(0).username(), "staging_user");
        } finally {
            System.clearProperty("environment");
        }
    }

    @Test(groups = "unit")
    public void environmentFallback() {
        System.setProperty("environment", "qa"); // no testdata/qa/ folder exists
        try {
            List<UserData> rows = TestDataFactory.loadList("loginData.json", UserData.class);
            assertEquals(rows.size(), 3, "should fall back to the base 3-row dataset");
        } finally {
            System.clearProperty("environment");
        }
    }
}
