package saucedemo.regression;

import org.junit.platform.suite.api.SelectClasses;
import org.junit.platform.suite.api.Suite;
import org.junit.platform.suite.api.SuiteDisplayName;
import saucedemo.tests.FilterTest;
import saucedemo.tests.LogoutTest;

import java.io.File;

@Suite
@SuiteDisplayName("Playwright Core Regression Suite")
@SelectClasses({
        FilterTest.class,
        LogoutTest.class,
})
public class RegressionTestSuite {
}
