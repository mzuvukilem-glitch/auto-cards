package com.company.automation.data;

import com.fasterxml.jackson.databind.MappingIterator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectReader;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;
import java.io.InputStream;
import java.util.List;
import java.util.Locale;

/**
 * Central access point for typed test data. Reads data files from the test classpath (e.g. {@code
 * src/test/resources/testdata/...}) into records/POJOs, so tests consume strongly-typed data
 * instead of loose maps or inline literals.
 *
 * <p>The data format is chosen from the file extension, so the same call site works for either:
 *
 * <pre>
 * List&lt;LoginData&gt; json = TestDataFactory.loadList("testdata/loginData.json", LoginData.class);
 * List&lt;LoginData&gt; csv  = TestDataFactory.loadList("testdata/loginData.csv",  LoginData.class);
 * </pre>
 *
 * <p>CSV files must have a header row whose column names match the target type's fields.
 *
 * <p><b>Environment-specific data:</b> when {@code -Denvironment=<env>} is set, an environment
 * copy placed in a sibling sub-folder is preferred and the base file is the fallback. For
 * {@code testdata/loginData.json} with {@code -Denvironment=staging} the lookup order is:
 *
 * <pre>
 * testdata/staging/loginData.json   (used if present)
 * testdata/loginData.json           (fallback)
 * </pre>
 *
 * This mirrors the {@code config.&lt;env&gt;.properties} overlay model, so data that differs per
 * environment (e.g. different test users) lives beside the shared default without changing call
 * sites.
 */
public final class TestDataFactory {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final CsvMapper CSV = new CsvMapper();

    private TestDataFactory() {}

    /** Load a data resource (JSON array or CSV with header) into a typed list. */
    public static <T> List<T> loadList(String resourcePath, Class<T> type) {
        try (InputStream in = open(resourcePath)) {
            if (isCsv(resourcePath)) {
                // Empty schema + header => columns are matched to fields by header NAME,
                // independent of column order (schemaFor(type) would match by position).
                CsvSchema schema = CsvSchema.emptySchema().withHeader();
                ObjectReader reader = CSV.readerFor(type).with(schema);
                try (MappingIterator<T> it = reader.readValues(in)) {
                    return it.readAll();
                }
            }
            return JSON.readValue(
                    in, JSON.getTypeFactory().constructCollectionType(List.class, type));
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

    /** Load a single-record data resource (JSON object or single-row CSV) into a typed instance. */
    public static <T> T load(String resourcePath, Class<T> type) {
        try (InputStream in = open(resourcePath)) {
            if (isCsv(resourcePath)) {
                CsvSchema schema = CsvSchema.emptySchema().withHeader();
                try (MappingIterator<T> it = CSV.readerFor(type).with(schema).readValues(in)) {
                    if (!it.hasNext()) {
                        throw new IllegalStateException("CSV has no data rows: " + resourcePath);
                    }
                    return it.next();
                }
            }
            return JSON.readValue(in, type);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Unable to load test data '" + resourcePath + "' as " + type.getSimpleName(),
                    e);
        }
    }

    private static boolean isCsv(String resourcePath) {
        return resourcePath.toLowerCase(Locale.ROOT).endsWith(".csv");
    }

    /**
     * Opens the data resource, preferring an environment-specific copy in a sibling sub-folder
     * ({@code <dir>/<env>/<file>}) when {@code -Denvironment} is set and that resource exists;
     * otherwise falls back to the base path.
     */
    private static InputStream open(String resourcePath) {
        ClassLoader cl = TestDataFactory.class.getClassLoader();
        String envPath = environmentPath(resourcePath);
        if (envPath != null && cl.getResource(envPath) != null) {
            return cl.getResourceAsStream(envPath);
        }
        InputStream in = cl.getResourceAsStream(resourcePath);
        if (in == null) {
            throw new IllegalStateException("Test data not found on classpath: " + resourcePath);
        }
        return in;
    }

    /**
     * Builds the environment-specific resource path ({@code <dir>/<env>/<file>}) from the current
     * {@code -Denvironment}, or {@code null} when no environment is set.
     */
    private static String environmentPath(String resourcePath) {
        String env = System.getProperty("environment", "").trim();
        if (env.isEmpty()) {
            return null;
        }
        int slash = resourcePath.lastIndexOf('/');
        String dir = slash < 0 ? "" : resourcePath.substring(0, slash + 1);
        String file = slash < 0 ? resourcePath : resourcePath.substring(slash + 1);
        return dir + env + "/" + file;
    }
}
