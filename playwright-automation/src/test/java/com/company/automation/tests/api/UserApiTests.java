package com.company.automation.tests.api;

import com.company.automation.api.UserService;
import com.company.automation.base.BaseApiTest;
import com.company.automation.utils.JsonUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.microsoft.playwright.APIResponse;
import io.qameta.allure.Description;
import io.qameta.allure.Severity;
import io.qameta.allure.SeverityLevel;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Example API tests driven by Playwright's APIRequestContext (no browser).
 * Covers status codes, headers, body/schema checks, and CRUD verbs.
 */
@Tag("api")
class UserApiTests extends BaseApiTest {

    private final UserService users = new UserService();

    @Test
    @Tag("smoke")
    @Severity(SeverityLevel.BLOCKER)
    @DisplayName("GET user returns 200 and the expected id")
    @Description("Fetch a single user and verify status, content type, and payload")
    void getUserReturnsExpectedPayload() {
        APIResponse response = users.getUser(2);

        // Status + OK helper
        assertEquals(200, response.status(), "Expected HTTP 200");
        assertTrue(response.ok(), "Response should be in the 2xx range");

        // Header check
        assertTrue(response.headers().getOrDefault("content-type", "").contains("application/json"),
                "Content-Type should be JSON");

        // Body / schema checks via Jackson
        JsonNode body = JsonUtils.parse(response.text());
        assertEquals(2, body.path("data").path("id").asInt(), "User id should match");
        assertFalse(body.path("data").path("email").asText().isBlank(), "email should be present");
    }

    @Test
    @Tag("regression")
    @DisplayName("POST create user returns 201 with echoed fields")
    void createUserReturns201() {
        APIResponse response = users.createUser("Neo", "The One");

        assertEquals(201, response.status(), "Create should return 201");
        JsonNode body = JsonUtils.parse(response.text());
        assertEquals("Neo", body.path("name").asText());
        assertEquals("The One", body.path("job").asText());
        assertFalse(body.path("id").asText().isBlank(), "A new id should be returned");
    }

    @Test
    @Tag("regression")
    @DisplayName("DELETE user returns 204")
    void deleteUserReturns204() {
        APIResponse response = users.deleteUser(2);
        assertEquals(204, response.status(), "Delete should return 204 No Content");
    }

    @ParameterizedTest(name = "page {0} returns users")
    @ValueSource(ints = {1, 2})
    @Tag("regression")
    @DisplayName("GET users list is non-empty per page")
    void listUsersPaged(int page) {
        APIResponse response = users.listUsers(page);
        assertEquals(200, response.status());

        JsonNode body = JsonUtils.parse(response.text());
        assertEquals(page, body.path("page").asInt(), "Echoed page should match");
        assertTrue(body.path("data").isArray() && body.path("data").size() > 0,
                "The data array should contain users");
    }
}
