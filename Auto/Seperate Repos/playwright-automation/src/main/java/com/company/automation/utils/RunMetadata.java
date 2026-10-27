package com.company.automation.utils;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Resolves run-level metadata (git SHA, branch, build number, CI flag) for the Allure report's
 * Environment widget. Values come from common CI environment variables, falling back to "local" so
 * the widget is always populated.
 */
public final class RunMetadata {

    private RunMetadata() {}

    /** Ordered metadata map suitable for writing to Allure environment.properties. */
    public static Map<String, String> asMap() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put(
                "Git.Commit",
                firstNonBlank("short SHA", "GITHUB_SHA", "CI_COMMIT_SHA", "BUILD_VCS_NUMBER"));
        m.put(
                "Git.Branch",
                firstNonBlank(
                        null,
                        "GITHUB_REF_NAME",
                        "CI_COMMIT_REF_NAME",
                        "BRANCH_NAME",
                        "GIT_BRANCH"));
        m.put(
                "Build.Number",
                firstNonBlank(
                        null,
                        "GITHUB_RUN_NUMBER",
                        "CI_PIPELINE_IID",
                        "BUILD_NUMBER",
                        "BUILD_BUILDNUMBER"));
        m.put("CI", String.valueOf(System.getenv("CI") != null));
        return m;
    }

    private static String firstNonBlank(String shorten, String... keys) {
        for (String key : keys) {
            String value = System.getenv(key);
            if (value != null && !value.isBlank()) {
                value = value.trim();
                if ("short SHA".equals(shorten) && value.length() > 12) {
                    return value.substring(0, 12);
                }
                return value;
            }
        }
        return "local";
    }
}
