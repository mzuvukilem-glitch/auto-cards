package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import com.company.automation.data.TestDataFactory;
import com.company.automation.data.UserData;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import java.util.List;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Data-driven login test fed by {@link TestDataFactory} from loginData.json. Demonstrates typed
 * test data (records) + a TestNG {@link DataProvider}, instead of inline literals.
 */
public class DataDrivenLoginTest extends BaseTest {

    @DataProvider(name = "logins")
    public Object[][] logins() {
        List<UserData> rows = TestDataFactory.loadList("loginData.json", UserData.class);
        return rows.stream().map(r -> new Object[] {r}).toArray(Object[][]::new);
    }

    @Test(
            dataProvider = "logins",
            groups = {"regression"})
    @Description("Each credential scenario lands (or not) on Home as declared in the data file")
    public void loginScenarios(UserData data) {
        LoginPage login = new LoginPage();
        var home = login.loginAs(data.username(), data.password());
        // The data file declares the expected outcome per scenario.
        boolean onHome = home.isLoaded();
        org.testng.Assert.assertEquals(onHome, data.expectHome(), "scenario: " + data.scenario());
    }
}
