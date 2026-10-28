package com.company.automation.data;

import com.company.automation.constants.FrameworkConstants;
import com.fasterxml.jackson.databind.MappingIterator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;
import java.io.File;
import java.util.List;
import java.util.Locale;

/**
 * Central access point for typed test data. Reads data files from {@code
 * src/test/resources/testdata} into records/POJOs, so tests consume strongly-typed data instead of
 * loose maps or inline literals.
 *
 * <p>The data format is chosen from the file extension, so the same call site works for either:
 *
 * <pre>
 * List&lt;UserData&gt; json = TestDataFactory.loadList("loginData.json", UserData.class);
 * List&lt;UserData&gt; csv  = TestDataFactory.loadList("loginData.csv",  UserData.class);
 * </pre>
 *
 * <p>CSV files must have a header row whose column names match the target type's fields.
 */
public final class TestDataFactory {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final CsvMapper CSV = new CsvMapper();

    private TestDataFactory() {}

    /** Load a data file (JSON array or CSV with header) into a typed list. */
    public static <T> List<T> loadList(String fileName, Class<T> type) {
        File file = dataFile(fileName);
        try {
            if (isCsv(fileName)) {
                // Empty schema + header => columns are matched to fields by header NAME,
                // independent of column order (schemaFor(type) would match by position).
                CsvSchema schema = CsvSchema.emptySchema().withHeader();
                try (MappingIterator<T> it =
                        CSV.readerFor(type).with(schema).readValues(file)) {
                    return it.readAll();
                }
            }
            return JSON.readValue(
                    file, JSON.getTypeFactory().constructCollectionType(List.class, type));
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

    /** Load a single-record data file (JSON object or single-row CSV) into a typed instance. */
    public static <T> T load(String fileName, Class<T> type) {
        File file = dataFile(fileName);
        try {
            if (isCsv(fileName)) {
                CsvSchema schema = CsvSchema.emptySchema().withHeader();
                try (MappingIterator<T> it =
                        CSV.readerFor(type).with(schema).readValues(file)) {
                    if (!it.hasNext()) {
                        throw new IllegalStateException("CSV has no data rows: " + fileName);
                    }
                    return it.next();
                }
            }
            return JSON.readValue(file, type);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Unable to load test data '" + fileName + "' as " + type.getSimpleName(), e);
        }
    }

    private static boolean isCsv(String fileName) {
        return fileName.toLowerCase(Locale.ROOT).endsWith(".csv");
    }

    private static File dataFile(String fileName) {
        return new File(FrameworkConstants.TESTDATA_PATH + "/" + fileName);
    }
}
