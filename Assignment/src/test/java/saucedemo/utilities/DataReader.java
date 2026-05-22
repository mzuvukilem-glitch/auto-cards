package saucedemo.utilities;

import java.io.BufferedReader;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;

public class DataReader {
    public static String[][] getCsvData(String filePath) throws Exception {
        List<String[]> records = new ArrayList<>();
        try (BufferedReader br = new BufferedReader(new FileReader(filePath))) {
            String line;
            boolean isHeader = true;

            while ((line = br.readLine()) != null) {
                if (isHeader) { // Skip header row
                    isHeader = false;
                    continue;
                }
                // Split by comma while preserving strings with commas inside quotes if needed
                String[] values = line.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)");
                records.add(values);
            }
        }
        return records.toArray(new String[0][0]);
    }
}
