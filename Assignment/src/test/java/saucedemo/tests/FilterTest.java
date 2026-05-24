package saucedemo.tests;

import io.qameta.allure.Feature;
import io.qameta.allure.Story;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvFileSource;
import saucedemo.base.Setup;
import saucedemo.pages.LoginPage;
import saucedemo.utilities.ProductSort;

@Feature("Filter")
public class FilterTest extends Setup {

    @Story("Filter Products")
    @ParameterizedTest
    @CsvFileSource(resources = "/testData/filters.csv", numLinesToSkip = 1)
    public void useFilterValidation(String testId, String scenario, String username, String password, String filter){

        LoginPage loginPage = new LoginPage();
        loginPage.performLogin(page, username, password);

        selectFilter(filter);
    }

    private void selectFilter(String filter){

        ProductSort sortOption = ProductSort.fromLabel(filter);

        page.locator(".product_sort_container").selectOption(sortOption.getOptionValue());

        // Validate the sort order
        sortOption.validate(page);

    }
}
