package com.company.automation.tests;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.company.automation.base.BaseTest;
import com.company.automation.config.ConfigReader;
import com.company.automation.data.LoginData;
import com.company.automation.data.TestDataFactory;
import com.company.automation.pages.InventoryPage;
import com.company.automation.pages.LoginPage;
import io.qameta.allure.Description;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Data-driven login test fed by {@link TestDataFactory} from a JSON file, using typed {@link
 * LoginData} records and a JUnit 5 {@code @MethodSource}.
 */
@Tag("regression")
class DataDrivenLoginTest extends BaseTest {

    static Stream<Arguments> logins() {
        List<LoginData> rows = TestDataFactory.loadList("testdata/loginData.json", LoginData.class);
        return rows.stream().map(Arguments::of);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("logins")
    @Description(
            "Each credential scenario lands (or not) on Inventory as declared in the data file")
    void loginScenarios(LoginData data) {
        page.navigate(ConfigReader.get("base.url") + "/");
        InventoryPage inventory = new LoginPage(page).login(data.username(), data.password());
        assertEquals(data.expectSuccess(), inventory.isLoaded(), "scenario: " + data.scenario());
    }
}
