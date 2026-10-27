package com.company.automation.config;

/**
 * Supported Playwright browser engines.
 */
public enum BrowserType {
    CHROMIUM,
    FIREFOX,
    WEBKIT;

    public static BrowserType from(String value) {
        if (value == null) {
            throw new IllegalArgumentException("Browser must not be null");
        }
        return switch (value.trim().toLowerCase()) {
            case "chromium", "chrome" -> CHROMIUM;
            case "firefox" -> FIREFOX;
            case "webkit", "safari" -> WEBKIT;
            default -> throw new IllegalArgumentException("Unsupported browser: " + value);
        };
    }
}
