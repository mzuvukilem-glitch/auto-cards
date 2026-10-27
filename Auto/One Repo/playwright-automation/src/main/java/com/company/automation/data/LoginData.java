package com.company.automation.data;

/**
 * Typed test-data record for a login scenario. A record (over a loose map) gives tests compile-time
 * safety and readable field access.
 */
public record LoginData(String scenario, String username, String password, boolean expectSuccess) {}
