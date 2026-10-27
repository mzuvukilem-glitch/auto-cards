package com.company.automation.base;

import com.company.automation.driver.DriverFactory;
import com.company.automation.utils.AllureEnvironmentWriter;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.BeforeSuite;
import org.testng.annotations.Optional;
import org.testng.annotations.Parameters;

/**
 * Lifecycle base for all test classes. Spins up a fresh driver per test
 * method (thread-safe) and tears it down afterwards.
 */
public abstract class BaseTest {

    @BeforeSuite(alwaysRun = true)
    public void beforeSuite() {
        // Populate the Allure report's Environment widget once per run
        AllureEnvironmentWriter.write();
    }

    @Parameters({"platform"})
    @BeforeMethod(alwaysRun = true)
    public void setUp(@Optional("android") String platform) {
        // -Dplatform=ios on the command line overrides the suite parameter
        String resolved = System.getProperty("platform", platform);
        DriverFactory.initDriver(resolved);
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        DriverFactory.quitDriver();
    }
}
