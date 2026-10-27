package com.company.automation.utils;

import com.company.automation.config.ConfigReader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Writes environment.properties into the Allure results directory so the
 * report's "Environment" widget shows platform/device/run metadata.
 */
public final class AllureEnvironmentWriter {

    private AllureEnvironmentWriter() {
    }

    public static void write() {
        String resultsDir = System.getProperty("allure.results.directory", "target/allure-results");

        Map<String, String> env = new LinkedHashMap<>();
        env.put("Platform", ConfigReader.get("platform", "android"));
        env.put("Appium.Server.URL", ConfigReader.get("appium.server.url", "http://127.0.0.1:4723"));
        env.put("Environment", ConfigReader.get("environment", "qa"));
        env.put("OS", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        env.put("Java.Version", System.getProperty("java.version"));

        StringBuilder sb = new StringBuilder();
        env.forEach((k, v) -> sb.append(k).append('=').append(v).append(System.lineSeparator()));

        try {
            Path dir = Path.of(resultsDir);
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("environment.properties"), sb.toString());
        } catch (IOException e) {
            // Non-fatal: a missing environment widget shouldn't fail the suite
            System.out.println("Could not write Allure environment.properties: " + e.getMessage());
        }
    }
}
