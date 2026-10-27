package com.company.automation.data;

/**
 * Typed test-data record for a login scenario. Using a record (over a loose Map) gives tests
 * compile-time safety and readable field access.
 */
public record UserData(String scenario, String username, String password, boolean expectHome) {}
