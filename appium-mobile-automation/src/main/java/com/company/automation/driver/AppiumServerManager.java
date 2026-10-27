package com.company.automation.driver;

import io.appium.java_client.service.local.AppiumDriverLocalService;
import io.appium.java_client.service.local.AppiumServiceBuilder;
import io.appium.java_client.service.local.flags.GeneralServerFlag;

/**
 * Optionally starts/stops a local Appium server programmatically, so CI jobs
 * don't need a separately managed server process.
 */
public final class AppiumServerManager {

    private static AppiumDriverLocalService service;

    private AppiumServerManager() {
    }

    public static synchronized void start() {
        if (service == null || !service.isRunning()) {
            service = new AppiumServiceBuilder()
                    .withArgument(GeneralServerFlag.BASEPATH, "/")
                    .withArgument(GeneralServerFlag.SESSION_OVERRIDE)
                    .build();
            service.start();
        }
    }

    public static synchronized void stop() {
        if (service != null && service.isRunning()) {
            service.stop();
        }
    }
}
