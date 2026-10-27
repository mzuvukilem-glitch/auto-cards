package com.company.automation.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.List;

/**
 * Central access point for typed test data. Reads JSON files from the test classpath (e.g. {@code
 * src/test/resources/testdata/...}) into records/POJOs, so tests consume strongly-typed data
 * instead of loose maps or inline literals.
 *
 * <pre>
 * List&lt;LoginData&gt; rows = TestDataFactory.loadList("testdata/loginData.json", LoginData.class);
 * </pre>
 */
public final class TestDataFactory {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TestDataFactory() {}

    /** Load a JSON array resource into a typed list. */
    public static <T> List<T> loadList(String resourcePath, Class<T> type) {
        try (InputStream in = open(resourcePath)) {
            return MAPPER.readValue(
                    in, MAPPER.getTypeFactory().constructCollectionType(List.class, type));
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Unable to load test data '"
                            + resourcePath
                            + "' as List<"
                            + type.getSimpleName()
                            + ">",
                    e);
        }
    }

    /** Load a single JSON object resource into a typed instance. */
    public static <T> T load(String resourcePath, Class<T> type) {
        try (InputStream in = open(resourcePath)) {
            return MAPPER.readValue(in, type);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Unable to load test data '" + resourcePath + "' as " + type.getSimpleName(),
                    e);
        }
    }

    private static InputStream open(String resourcePath) {
        InputStream in = TestDataFactory.class.getClassLoader().getResourceAsStream(resourcePath);
        if (in == null) {
            throw new IllegalStateException("Test data not found on classpath: " + resourcePath);
        }
        return in;
    }
}
