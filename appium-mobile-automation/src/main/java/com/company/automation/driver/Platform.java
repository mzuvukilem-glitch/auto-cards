package com.company.automation.driver;

/**
 * Supported mobile platforms.
 */
public enum Platform {
    ANDROID,
    IOS;

    public static Platform from(String value) {
        if (value == null) {
            throw new IllegalArgumentException("Platform must not be null");
        }
        return switch (value.trim().toLowerCase()) {
            case "android" -> ANDROID;
            case "ios" -> IOS;
            default -> throw new IllegalArgumentException("Unsupported platform: " + value);
        };
    }
}
