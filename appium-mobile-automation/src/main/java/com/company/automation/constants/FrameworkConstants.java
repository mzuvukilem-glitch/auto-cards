package com.company.automation.constants;

/**
 * Centralised framework constants: paths, timeouts and config keys.
 * Nothing environment-specific is hard-coded in test classes.
 */
public final class FrameworkConstants {

    private FrameworkConstants() {
        // static holder
    }

    private static final String USER_DIR = System.getProperty("user.dir");

    // Paths
    public static final String RESOURCES_PATH = USER_DIR + "/src/test/resources";
    public static final String CONFIG_PATH = RESOURCES_PATH + "/config/config.properties";
    public static final String TESTDATA_PATH = RESOURCES_PATH + "/testdata";
    public static final String APPS_PATH = RESOURCES_PATH + "/apps";
    public static final String SCREENSHOT_PATH = USER_DIR + "/screenshots";

    // Timeouts (seconds)
    public static final int EXPLICIT_WAIT = 20;
    public static final int IMPLICIT_WAIT = 0; // prefer explicit waits
    public static final int POLLING_INTERVAL_MS = 500;

    // Retry
    public static final int MAX_RETRY_COUNT = 2;

    // Config keys
    public static final String KEY_PLATFORM = "platform";
    public static final String KEY_SERVER_URL = "appium.server.url";
}
