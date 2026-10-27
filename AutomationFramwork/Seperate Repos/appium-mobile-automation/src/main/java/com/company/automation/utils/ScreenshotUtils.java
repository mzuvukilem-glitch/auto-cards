package com.company.automation.utils;

import com.company.automation.constants.FrameworkConstants;
import com.company.automation.driver.DriverManager;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;

/**
 * Captures screenshots (used by the listener on test failure) and returns the bytes for attaching
 * to Allure reports.
 */
public final class ScreenshotUtils {

    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss_SSS");

    private ScreenshotUtils() {}

    public static byte[] captureAsBytes() {
        return ((TakesScreenshot) DriverManager.getDriver()).getScreenshotAs(OutputType.BYTES);
    }

    public static String captureToFile(String testName) {
        try {
            byte[] bytes = captureAsBytes();
            Path dir = Path.of(FrameworkConstants.SCREENSHOT_PATH);
            Files.createDirectories(dir);
            String fileName = testName + "_" + LocalDateTime.now().format(STAMP) + ".png";
            File dest = dir.resolve(fileName).toFile();
            Files.write(dest.toPath(), bytes);
            return dest.getAbsolutePath();
        } catch (Exception e) {
            return null;
        }
    }
}
