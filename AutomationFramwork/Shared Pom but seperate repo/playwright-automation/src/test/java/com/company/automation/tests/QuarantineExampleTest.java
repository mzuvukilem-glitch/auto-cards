package com.company.automation.tests;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.company.automation.base.BaseTest;
import io.qameta.allure.Description;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Example of a quarantined (known-flaky) test. Tagged {@code quarantine}, it is excluded from the
 * default gate run (Surefire {@code excludedGroups=quarantine}) but stays visible and can be run
 * deliberately with {@code mvn test -Dgroups=quarantine -DexcludedGroups=}.
 */
@Tag("quarantine")
class QuarantineExampleTest extends BaseTest {

    @Test
    @DisplayName("A flaky test kept out of the gate suite")
    @Description("Quarantined so it does not block CI while the flakiness is investigated")
    void knownFlakyScenario() {
        assertNotNull(page.url());
    }
}
