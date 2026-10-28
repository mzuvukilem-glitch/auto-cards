package com.company.automation.driver;

import com.company.automation.config.ConfigReader;
import io.appium.java_client.service.local.AppiumDriverLocalService;
import io.appium.java_client.service.local.AppiumServiceBuilder;
import io.appium.java_client.service.local.flags.GeneralServerFlag;
import java.net.URI;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Optionally starts/stops a local Appium server programmatically, so CI jobs don't need a
 * separately managed server process.
 *
 * <p>Enabled with {@code -Dappium.server.autostart=true} (off by default). When enabled, the server
 * is bound to the host and port parsed from {@code appium.server.url} so it comes up exactly where
 * {@code DriverFactory} connects — otherwise an autostarted server could bind a different port than
 * the driver's target URL.
 */
public final class AppiumServerManager {

    private static final Logger log = LogManager.getLogger(AppiumServerManager.class);
    private static final String DEFAULT_URL = "http://127.0.0.1:4723";

    private static AppiumDriverLocalService service;

    private AppiumServerManager() {}

    public static synchronized void start() {
        if (service != null && service.isRunning()) {
            return;
        }

        String urlValue = ConfigReader.get("appium.server.url", DEFAULT_URL);
        String host = "127.0.0.1";
        int port = 4723;
        try {
            URI uri = new URI(urlValue);
            if (uri.getHost() != null) {
                host = uri.getHost();
            }
            if (uri.getPort() != -1) {
                port = uri.getPort();
            }
        } catch (Exception e) {
            log.warn(
                    "Could not parse host/port from appium.server.url '{}'; falling back to {}:{}",
                    urlValue,
                    host,
                    port);
        }

        service =
                new AppiumServiceBuilder()
                        .withIPAddress(host)
                        .usingPort(port)
                        .withArgument(GeneralServerFlag.BASEPATH, "/")
                        .withArgument(GeneralServerFlag.SESSION_OVERRIDE)
                        .build();
        service.start();
        log.info("Started local Appium server on {}:{}", host, port);
    }

    public static synchronized void stop() {
        if (service != null && service.isRunning()) {
            service.stop();
            log.info("Stopped local Appium server");
        }
    }
}
