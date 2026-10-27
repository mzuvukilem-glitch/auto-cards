package com.company.automation.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import com.company.automation.data.LoginData;
import com.company.automation.data.TestDataFactory;
import com.company.automation.pages.InventoryPage;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Allure;
import io.qameta.allure.Description;
import java.util.List;
import java.util.stream.Stream;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Data-driven login/logout regression test for saucedemo.
 *
 * <p>Covers the assignment's requirements: a valid user logs in AND logs out without error;
 * negative scenarios (locked-out / wrong password) are driven from the same data file; and on a
 * failed login the site's error message is captured to the log and the Allure report so a failed
 * scenario is identifiable from the report alone.
 */
@Tag("regression")
class LoginLogoutTest extends BaseTest {

    private static final Logger log = LogManager.getLogger(LoginLogoutTest.class);

    static Stream<Arguments> logins() {
        List<LoginData> rows = TestDataFactory.loadList("testdata/loginData.json", LoginData.class);
        return rows.stream().map(Arguments::of);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("logins")
    @Description("Valid user logs in and out; invalid users surface a reported error message")
    void loginLogoutScenarios(LoginData data) {
        LoginPage login = openLogin();
        InventoryPage inventory = login.login(data.username(), data.password());

        if (data.expectSuccess()) {
            // Positive path: must reach inventory, then log out cleanly back to the login screen.
            assertTrue(
                    inventory.isLoaded(),
                    "scenario " + data.scenario() + ": should land on inventory");
            LoginPage afterLogout = inventory.logout();
            assertTrue(
                    afterLogout.isLoaded(),
                    "scenario " + data.scenario() + ": should return to login after logout");
            log.info("[{}] login+logout succeeded", data.scenario());
        } else {
            // Negative path: capture and REPORT the site's error message (log + Allure attachment).
            String error = login.getError();
            log.warn("[{}] login failed with site message: {}", data.scenario(), error);
            Allure.addAttachment("Login error — " + data.scenario(), "text/plain", error);
            assertFalse(
                    inventory.isLoaded(),
                    "scenario " + data.scenario() + ": should NOT reach inventory");
            assertFalse(
                    error.isBlank(),
                    "scenario " + data.scenario() + ": an error message should be shown");
        }
    }

    @org.junit.jupiter.api.Test
    @Tag("smoke")
    @Description("Standard user can log in then log out without error")
    void standardUserCanLoginAndLogout() {
        InventoryPage inventory =
                openLogin()
                        .login(
                                ConfigReader.get("standard.user", "standard_user"),
                                ConfigReader.get("standard.password", "secret_sauce"));
        assertTrue(inventory.isLoaded(), "should be logged in");

        LoginPage back = inventory.logout();
        assertTrue(back.isLoaded(), "should be logged out");
        assertEquals(
                ConfigReader.get("base.url") + "/",
                back.url(),
                "logout should return to the login URL");
    }
}
