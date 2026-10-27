package com.company.automation.utils;

import com.company.automation.constants.FrameworkConstants;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Reads JSON test data files from src/test/resources/testdata.
 */
public final class JsonDataReader {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonDataReader() {
    }

    public static List<Map<String, Object>> readAsList(String fileName) {
        try {
            File file = new File(FrameworkConstants.TESTDATA_PATH + "/" + fileName);
            return MAPPER.readValue(file,
                    MAPPER.getTypeFactory().constructCollectionType(List.class, Map.class));
        } catch (IOException e) {
            throw new IllegalStateException("Unable to read JSON test data: " + fileName, e);
        }
    }
}
