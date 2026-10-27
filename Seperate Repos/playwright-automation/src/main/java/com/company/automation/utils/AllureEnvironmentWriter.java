package com.company.automation.utils;

import com.company.automation.config.ConfigReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Writes environment.properties into the Allure results directory so the report's "Environment"
 * widget shows browser/environment/run metadata.
 */
public final class AllureEnvironmentWriter {

    private AllureEnvironmentWriter() {}

    public static void write() {
        String resultsDir = System.getProperty("allure.results.directory", "target/allure-results");

        Map<String, String> env = new LinkedHashMap<>();
        env.put("Browser", ConfigReader.get("browser", "chromium"));
        env.put("Base.URL", ConfigReader.get("base.url", ""));
        env.put("Environment", ConfigReader.get("environment", "qa"));
        env.put("OS", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        env.put("Java.Version", System.getProperty("java.version"));
        // Run metadata (git SHA/branch/build/CI) from CI env vars.
        env.putAll(RunMetadata.asMap());

        StringBuilder sb = new StringBuilder();
        env.forEach((k, v) -> sb.append(k).append('=').append(v).append(System.lineSeparator()));

        try {
            Path dir = Path.of(resultsDir);
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("environment.properties"), sb.toString());
        } catch (IOException e) {
            System.out.println("Could not write Allure environment.properties: " + e.getMessage());
        }
    }
}
