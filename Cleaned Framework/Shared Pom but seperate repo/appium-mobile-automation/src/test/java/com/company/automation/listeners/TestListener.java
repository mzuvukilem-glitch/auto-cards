package com.company.automation.listeners;

import com.company.automation.utils.ScreenshotUtils;
import io.qameta.allure.Allure;
import java.io.ByteArrayInputStream;
import org.testng.ITestContext;
import org.testng.ITestListener;
import org.testng.ITestResult;

/**
 * TestNG listener: logs lifecycle events and attaches a screenshot to the Allure report whenever a
 * test fails.
 */
public class TestListener implements ITestListener {

    @Override
    public void onStart(ITestContext context) {
        System.out.println("[SUITE START] " + context.getName());
    }

    @Override
    public void onTestStart(ITestResult result) {
        System.out.println("[TEST START] " + result.getMethod().getMethodName());
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        System.out.println("[PASS] " + result.getMethod().getMethodName());
    }

    @Override
    public void onTestFailure(ITestResult result) {
        System.out.println("[FAIL] " + result.getMethod().getMethodName());
        try {
            byte[] screenshot = ScreenshotUtils.captureAsBytes();
            Allure.addAttachment("Failure screenshot", new ByteArrayInputStream(screenshot));
            ScreenshotUtils.captureToFile(result.getMethod().getMethodName());
        } catch (Exception e) {
            System.out.println("Could not capture failure screenshot: " + e.getMessage());
        }
    }

    @Override
    public void onTestSkipped(ITestResult result) {
        System.out.println("[SKIP] " + result.getMethod().getMethodName());
    }

    @Override
    public void onFinish(ITestContext context) {
        System.out.println("[SUITE END] " + context.getName());
    }
}
