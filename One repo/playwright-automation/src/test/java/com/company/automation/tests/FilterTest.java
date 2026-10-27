package com.company.automation.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import com.company.automation.pages.InventoryPage;
import com.company.automation.utils.ScreenshotUtils;
import io.qameta.allure.Allure;
import io.qameta.allure.Description;
import java.io.ByteArrayInputStream;
import java.util.Comparator;
import java.util.List;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * Filter (product sort) regression test for saucedemo.
 *
 * <p>Exercises each sort option, validates the displayed order matches the expected order, and
 * attaches a screenshot of each filtered result to the Allure report (so the outcome is visible as
 * screenshots, as the assignment asks). Pass/fail is asserted programmatically per filter.
 */
@Tag("regression")
class FilterTest extends BaseTest {

    private static final Logger log = LogManager.getLogger(FilterTest.class);

    private InventoryPage login() {
        return openLogin()
                .login(
                        ConfigReader.get("standard.user", "standard_user"),
                        ConfigReader.get("standard.password", "secret_sauce"));
    }

    /**
     * value = the site's sort option value; kind = what to validate (name-asc/desc,
     * price-asc/desc).
     */
    @ParameterizedTest(name = "sort {0} -> {1}")
    @CsvSource({"az,name-asc", "za,name-desc", "lohi,price-asc", "hilo,price-desc"})
    @DisplayName("Each sort filter displays correctly ordered results")
    @Description(
            "Applies a sort filter, validates the order, and attaches a screenshot of the result")
    void sortFiltersProduceOrderedResults(String optionValue, String kind) {
        InventoryPage inventory = login().sortBy(optionValue);

        // Capture the filtered view as a screenshot in the report (evidence per the brief).
        byte[] shot = ScreenshotUtils.capture(page);
        Allure.addAttachment("Filter " + optionValue, new ByteArrayInputStream(shot));

        switch (kind) {
            case "name-asc" -> assertSortedNames(inventory, true);
            case "name-desc" -> assertSortedNames(inventory, false);
            case "price-asc" -> assertSortedPrices(inventory, true);
            case "price-desc" -> assertSortedPrices(inventory, false);
            default -> throw new IllegalArgumentException("Unknown kind: " + kind);
        }
        log.info("filter '{}' produced correctly ordered results", optionValue);
    }

    private void assertSortedNames(InventoryPage inventory, boolean ascending) {
        List<String> actual = inventory.productNames();
        List<String> expected =
                actual.stream()
                        .sorted(ascending ? Comparator.naturalOrder() : Comparator.reverseOrder())
                        .toList();
        assertEquals(
                expected, actual, "product names should be sorted " + (ascending ? "A→Z" : "Z→A"));
    }

    private void assertSortedPrices(InventoryPage inventory, boolean ascending) {
        List<Double> actual = inventory.productPrices();
        List<Double> expected =
                actual.stream()
                        .sorted(ascending ? Comparator.naturalOrder() : Comparator.reverseOrder())
                        .toList();
        assertEquals(
                expected,
                actual,
                "prices should be sorted " + (ascending ? "low→high" : "high→low"));
    }
}
