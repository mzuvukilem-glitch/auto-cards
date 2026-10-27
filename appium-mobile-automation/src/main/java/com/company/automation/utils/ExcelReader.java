package com.company.automation.utils;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads .xlsx test data into a list of row maps keyed by header name.
 */
public final class ExcelReader {

    private ExcelReader() {
    }

    public static List<Map<String, String>> read(String filePath, String sheetName) {
        List<Map<String, String>> rows = new ArrayList<>();
        try (FileInputStream fis = new FileInputStream(filePath);
             Workbook workbook = new XSSFWorkbook(fis)) {

            Sheet sheet = workbook.getSheet(sheetName);
            if (sheet == null) {
                throw new IllegalArgumentException("Sheet not found: " + sheetName);
            }

            Row header = sheet.getRow(0);
            for (int r = 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) {
                    continue;
                }
                Map<String, String> rowMap = new LinkedHashMap<>();
                for (int c = 0; c < header.getLastCellNum(); c++) {
                    String key = cellValue(header.getCell(c));
                    String value = cellValue(row.getCell(c));
                    rowMap.put(key, value);
                }
                rows.add(rowMap);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Unable to read Excel file: " + filePath, e);
        }
        return rows;
    }

    private static String cellValue(Cell cell) {
        if (cell == null) {
            return "";
        }
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> String.valueOf(cell.getNumericCellValue());
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            default -> "";
        };
    }
}
