package com.company.automation.tests.examples;

import com.company.automation.base.BaseTest;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Example of a quarantined (known-flaky) test. In the {@code quarantine} group, it is excluded from
 * the gate suite (testng.xml) but stays visible and can be run deliberately with {@code mvn test
 * -DsuiteXmlFile=quarantine.xml}.
 */
public class QuarantineExampleTest extends BaseTest {

    @Test(groups = {"quarantine"})
    @Description("Quarantined so it does not block CI while the flakiness is investigated")
    public void knownFlakyScenario() {
        Assert.assertTrue(new LoginPage().isLoaded(), "login screen present");
    }
}
