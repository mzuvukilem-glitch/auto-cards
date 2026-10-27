package com.company.automation.base;

import com.company.automation.driver.api.ApiRequestFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;

/**
 * Lifecycle base for API tests. Creates a fresh APIRequestContext per test (thread-safe, no
 * browser) and disposes it afterwards.
 */
public abstract class BaseApiTest {

    @BeforeEach
    void setUpApi() {
        ApiRequestFactory.init();
    }

    @AfterEach
    void tearDownApi() {
        ApiRequestFactory.dispose();
    }
}
