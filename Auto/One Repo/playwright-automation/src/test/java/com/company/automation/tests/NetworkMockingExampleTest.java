package com.company.automation.tests;

import com.company.automation.base.BaseTest;
import io.qameta.allure.Description;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Demonstrates network interception/mocking with {@code page.route(...)}. Stubbing backend
 * responses makes UI tests deterministic (no reliance on live data) and lets you exercise edge
 * cases (empty states, errors) on demand.
 */
@Tag("regression")
class NetworkMockingExampleTest extends BaseTest {

    @Test
    @DisplayName("Stub an API response with page.route")
    @Description("Intercept a request and fulfil it with a canned JSON body")
    void stubApiResponse() {
        // Intercept any call to **/api/products and return our own payload.
        page.route(
                "**/api/products",
                route ->
                        route.fulfill(
                                new com.microsoft.playwright.Route.FulfillOptions()
                                        .setStatus(200)
                                        .setContentType("application/json")
                                        .setBody(
                                                "{\"products\":[{\"id\":1,\"name\":\"Mocked Item\"}]}")));

        // Example of blocking a resource type (e.g. images) to speed up a run:
        page.route("**/*.{png,jpg,jpeg}", route -> route.abort());

        // From here, navigation/actions that hit those URLs receive the mocked
        // response / are aborted. (No assertion here — this is a reference.)
        page.navigate(com.company.automation.config.ConfigReader.get("base.url"));
    }
}
