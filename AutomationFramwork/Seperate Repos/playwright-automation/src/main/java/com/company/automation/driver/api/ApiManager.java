package com.company.automation.driver.api;

import com.microsoft.playwright.APIRequestContext;
import com.microsoft.playwright.Playwright;

/**
 * Thread-safe holder for the Playwright instance and APIRequestContext used by API tests, so they
 * can run in parallel without sharing state.
 *
 * <p>API tests do not need a browser — Playwright's {@link APIRequestContext} performs HTTP
 * directly, sharing cookies/auth within a context.
 */
public final class ApiManager {

    private static final ThreadLocal<Playwright> PLAYWRIGHT = new ThreadLocal<>();
    private static final ThreadLocal<APIRequestContext> REQUEST = new ThreadLocal<>();

    private ApiManager() {}

    public static APIRequestContext getRequest() {
        APIRequestContext request = REQUEST.get();
        if (request == null) {
            throw new IllegalStateException(
                    "APIRequestContext not initialised for this thread. Call ApiRequestFactory.init first.");
        }
        return request;
    }

    public static void setPlaywright(Playwright playwright) {
        PLAYWRIGHT.set(playwright);
    }

    public static void setRequest(APIRequestContext request) {
        REQUEST.set(request);
    }

    public static Playwright getPlaywrightOrNull() {
        return PLAYWRIGHT.get();
    }

    public static APIRequestContext getRequestOrNull() {
        return REQUEST.get();
    }

    public static void unload() {
        PLAYWRIGHT.remove();
        REQUEST.remove();
    }
}
