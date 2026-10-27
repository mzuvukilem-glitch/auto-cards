package com.company.automation.config;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Resolves secrets (tokens, cloud keys) WITHOUT committing them.
 *
 * <p>Resolution order (highest wins):
 *
 * <pre>
 * 1. -Dkey=value          (JVM system property)
 * 2. environment variable (KEY or KEY_UPPER_SNAKE)
 * 3. .env file at project root (git-ignored)
 * </pre>
 *
 * Use {@link #require(String)} for mandatory secrets — it fails fast with a clear message naming
 * the missing key and how to provide it.
 */
public final class Secrets {

    private static final Properties DOT_ENV = new Properties();

    static {
        Path env = Path.of(".env");
        if (Files.exists(env)) {
            try (FileInputStream fis = new FileInputStream(env.toFile())) {
                DOT_ENV.load(fis);
            } catch (IOException ignored) {
                // A malformed/locked .env should not crash the suite.
            }
        }
    }

    private Secrets() {}

    public static String get(String key, String defaultValue) {
        String value = resolve(key);
        return value == null ? defaultValue : value;
    }

    public static String require(String key) {
        String value = resolve(key);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Missing required secret '"
                            + key
                            + "'. Provide it via -D"
                            + key
                            + "=... , an environment variable "
                            + toEnvVar(key)
                            + ", or a .env entry "
                            + key
                            + "=...");
        }
        return value;
    }

    private static String resolve(String key) {
        String sys = System.getProperty(key);
        if (sys != null && !sys.isBlank()) {
            return sys.trim();
        }
        String env = System.getenv(key);
        if (env != null && !env.isBlank()) {
            return env.trim();
        }
        String envUpper = System.getenv(toEnvVar(key));
        if (envUpper != null && !envUpper.isBlank()) {
            return envUpper.trim();
        }
        String dotEnv = DOT_ENV.getProperty(key);
        return dotEnv == null ? null : dotEnv.trim();
    }

    private static String toEnvVar(String key) {
        return key.replace('.', '_').replace('-', '_').toUpperCase();
    }
}
