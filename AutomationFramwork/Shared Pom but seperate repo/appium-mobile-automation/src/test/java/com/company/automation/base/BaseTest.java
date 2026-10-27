package com.company.automation.base;

import com.company.automation.config.ConfigReader;
import com.company.automation.driver.AppiumServerManager;
import com.company.automation.driver.DriverFactory;
import com.company.automation.utils.AllureEnvironmentWriter;
import java.lang.reflect.Method;
import org.apache.logging.log4j.ThreadContext;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.AfterSuite;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.BeforeSuite;
import org.testng.annotations.Optional;
import org.testng.annotations.Parameters;

/**
 * Lifecycle base for all test classes. Spins up a fresh driver per test method (thread-safe) and
 * tears it down afterwards.
 */
public abstract class BaseTest {

    @BeforeSuite(alwaysRun = true)
    public void beforeSuite() {
        // Optionally start a local Appium server for the whole run.
        // Enable with -Dappium.server.autostart=true (default: use an external server).
        if (ConfigReader.getBoolean("appium.server.autostart", false)) {
            AppiumServerManager.start();
        }
        // Populate the Allure report's Environment widget once per run
        AllureEnvironmentWriter.write();
    }

    @AfterSuite(alwaysRun = true)
    public void afterSuite() {
        if (ConfigReader.getBoolean("appium.server.autostart", false)) {
            AppiumServerManager.stop();
        }
    }

    @Parameters({"platform"})
    @BeforeMethod(alwaysRun = true)
    public void setUp(@Optional("android") String platform, Method method) {
        // Correlation id for this thread's test — appears in logs as [%X{testId}].
        ThreadContext.put("testId", method.getName() + "-" + Thread.currentThread().getId());
        // -Dplatform=ios on the command line overrides the suite parameter
        String resolved = System.getProperty("platform", platform);
        DriverFactory.initDriver(resolved);
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        DriverFactory.quitDriver();
        ThreadContext.remove("testId");
    }
}
