package com.company.automation.listeners;

import com.company.automation.constants.FrameworkConstants;
import org.testng.IRetryAnalyzer;
import org.testng.ITestResult;

/**
 * Retries a failed test up to MAX_RETRY_COUNT times to absorb flaky
 * mobile/network hiccups.
 */
public class RetryAnalyzer implements IRetryAnalyzer {

    private int count = 0;

    @Override
    public boolean retry(ITestResult result) {
        if (count < FrameworkConstants.MAX_RETRY_COUNT) {
            count++;
            return true;
        }
        return false;
    }
}
