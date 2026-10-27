package com.company.automation.api;

import com.company.automation.driver.api.ApiManager;
import com.company.automation.utils.JsonUtils;
import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.options.RequestOptions;
import io.qameta.allure.Step;

import java.util.Map;

/**
 * Example API client (service wrapper) for a Users endpoint, modelled on the
 * public demo API https://reqres.in. Keeps endpoint paths and request shapes in
 * one place, so tests read like intent and the driver detail stays here.
 *
 * <p>Mirrors the Page Object idea: a service exposes operations, returns the raw
 * {@link APIResponse}, and tests assert on it.
 */
public class UserService {

    private static final String USERS = "/api/users";

    /** GET /api/users?page=N — list users. */
    @Step("GET list of users (page {0})")
    public APIResponse listUsers(int page) {
        return ApiManager.getRequest().get(USERS,
                RequestOptions.create().setQueryParam("page", page));
    }

    /** GET /api/users/{id} — fetch a single user. */
    @Step("GET user {0}")
    public APIResponse getUser(int id) {
        return ApiManager.getRequest().get(USERS + "/" + id);
    }

    /** POST /api/users — create a user from a name/job body. */
    @Step("POST create user '{0}'")
    public APIResponse createUser(String name, String job) {
        String body = JsonUtils.toJson(Map.of("name", name, "job", job));
        return ApiManager.getRequest().post(USERS,
                RequestOptions.create().setData(body));
    }

    /** PUT /api/users/{id} — replace a user. */
    @Step("PUT update user {0}")
    public APIResponse updateUser(int id, String name, String job) {
        String body = JsonUtils.toJson(Map.of("name", name, "job", job));
        return ApiManager.getRequest().put(USERS + "/" + id,
                RequestOptions.create().setData(body));
    }

    /** DELETE /api/users/{id} — remove a user. */
    @Step("DELETE user {0}")
    public APIResponse deleteUser(int id) {
        return ApiManager.getRequest().delete(USERS + "/" + id);
    }
}
