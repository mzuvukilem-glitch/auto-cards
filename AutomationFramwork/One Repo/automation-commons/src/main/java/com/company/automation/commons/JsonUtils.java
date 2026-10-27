package com.company.automation.commons;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Small JSON helper backed by Jackson for building request bodies and reading response payloads.
 * Shared by all automation frameworks.
 */
public final class JsonUtils {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonUtils() {}

    /** Serialise any object (or Map) to a JSON string. */
    public static String toJson(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialise to JSON", e);
        }
    }

    /** Parse a JSON string into a navigable tree. */
    public static JsonNode parse(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to parse JSON: " + json, e);
        }
    }

    /** Deserialise a JSON string into a typed object (POJO/record). */
    public static <T> T fromJson(String json, Class<T> type) {
        try {
            return MAPPER.readValue(json, type);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to deserialise JSON to " + type.getSimpleName(), e);
        }
    }
}
