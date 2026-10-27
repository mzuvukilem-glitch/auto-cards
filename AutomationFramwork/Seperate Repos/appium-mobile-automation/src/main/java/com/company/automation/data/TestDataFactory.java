package com.company.automation.data;

import com.company.automation.constants.FrameworkConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.util.List;

/**
 * Central access point for typed test data. Reads JSON files from {@code
 * src/test/resources/testdata} into records/POJOs, so tests consume strongly-typed data instead of
 * loose maps or inline literals.
 *
 * <pre>
 * List&lt;UserData&gt; users = TestDataFactory.loadList("loginData.json", UserData.class);
 * </pre>
 */
public final class TestDataFactory {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TestDataFactory() {}

    /** Load a JSON array file into a typed list. */
    public static <T> List<T> loadList(String fileName, Class<T> type) {
        try {
            File file = new File(FrameworkConstants.TESTDATA_PATH + "/" + fileName);
            return MAPPER.readValue(
                    file, MAPPER.getTypeFactory().constructCollectionType(List.class, type));
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Unable to load test data '"
                            + fileName
                            + "' as List<"
                            + type.getSimpleName()
                            + ">",
                    e);
        }
    }

    /** Load a single JSON object file into a typed instance. */
    public static <T> T load(String fileName, Class<T> type) {
        try {
            File file = new File(FrameworkConstants.TESTDATA_PATH + "/" + fileName);
            return MAPPER.readValue(file, type);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Unable to load test data '" + fileName + "' as " + type.getSimpleName(), e);
        }
    }
}
