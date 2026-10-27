package com.company.automation.driver.api;

import com.company.automation.config.ConfigReader;
import com.microsoft.playwright.APIRequest;
import com.microsoft.playwright.APIRequestContext;
import com.microsoft.playwright.Playwright;
import java.util.HashMap;
import java.util.Map;

/**
 * Creates and tears down an {@link APIRequestContext} per thread, configured with the API base URL
 * and default headers. Held in {@link ApiManager}.
 */
public final class ApiRequestFactory {

    private ApiRequestFactory() {}

    /** Creates an APIRequestContext for the current thread. */
    public static APIRequestContext init() {
        Playwright playwright = Playwright.create();
        ApiManager.setPlaywright(playwright);

        Map<String, String> headers = new HashMap<>();
        headers.put("Accept", "application/json");
        headers.put("Content-Type", "application/json");

        // Optional bearer token, resolved as a secret (-D > env var > .env).
        // Leave unset for public APIs.
        String token = com.company.automation.config.Secrets.get("api.token", "");
        if (!token.isBlank()) {
            headers.put("Authorization", "Bearer " + token);
        }

        APIRequestContext request =
                playwright
                        .request()
                        .newContext(
                                new APIRequest.NewContextOptions()
                                        .setBaseURL(
                                                ConfigReader.get(
                                                        "api.base.url", "https://reqres.in"))
                                        .setExtraHTTPHeaders(headers)
                                        .setTimeout(ConfigReader.getInt("api.timeout", 30000)));
        ApiManager.setRequest(request);
        return request;
    }

    /** Disposes the current thread's APIRequestContext and Playwright instance. */
    public static void dispose() {
        APIRequestContext request = ApiManager.getRequestOrNull();
        if (request != null) {
            request.dispose();
        }
        Playwright playwright = ApiManager.getPlaywrightOrNull();
        if (playwright != null) {
            playwright.close();
        }
        ApiManager.unload();
    }
}
