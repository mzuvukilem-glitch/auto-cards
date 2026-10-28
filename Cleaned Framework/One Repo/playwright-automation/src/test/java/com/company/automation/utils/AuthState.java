package com.company.automation.utils;

import com.microsoft.playwright.BrowserContext;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Helpers for persisting and reusing authenticated session state ({@code storageState}). Logging in
 * once and reusing the saved cookies/local storage lets subsequent tests skip the login UI — a
 * large speed-up for suites where most tests require an authenticated user.
 *
 * <p>Typical flow:
 *
 * <ol>
 *   <li>A one-time setup logs in via the UI, then {@link #save(BrowserContext)}.
 *   <li>Tests create their context with {@code setStorageStatePath(statePath())} (see {@code
 *       PlaywrightFactory}), starting already logged in.
 * </ol>
 */
public final class AuthState {

    private static final Path STATE = Paths.get("storage-state", "auth.json");

    private AuthState() {}

    /** Path where the signed-in session state is stored. */
    public static Path statePath() {
        return STATE;
    }

    /** True if a saved session exists and can be reused. */
    public static boolean exists() {
        return Files.exists(STATE);
    }

    /** Persist the current context's cookies/local storage to disk. */
    public static void save(BrowserContext context) {
        try {
            Files.createDirectories(STATE.getParent());
            context.storageState(new BrowserContext.StorageStateOptions().setPath(STATE));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to save storage state to " + STATE, e);
        }
    }
}
