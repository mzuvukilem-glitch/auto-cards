package saucedemo.utilities;

import com.microsoft.playwright.Page;
import io.qameta.allure.Step;
import org.junit.jupiter.api.Assertions;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

public enum ProductSort {
    AZ("A-Z", "az") {
        @Override
        public void validate(Page page) {
            List<String> names = page.locator(".inventory_item_name").allTextContents();
            List<String> sorted = new ArrayList<>(names);
            Collections.sort(sorted);
            Assertions.assertEquals(sorted, names, "Products are not sorted A-Z");
        }
    },
    ZA("Z-A", "za") {
        @Override
        public void validate(Page page) {
            List<String> names = page.locator(".inventory_item_name").allTextContents();
            List<String> sorted = new ArrayList<>(names);
            Collections.sort(sorted, Collections.reverseOrder());
            Assertions.assertEquals(sorted, names, "Products are not sorted Z-A");
        }
    },
    LOHI("LO-HI", "lohi") {
        @Override
        public void validate(Page page) {
            List<Double> prices = page.locator(".inventory_item_price").allTextContents()
                    .stream()
                    .map(s -> Double.parseDouble(s.replace("$", "")))
                    .collect(Collectors.toList());
            List<Double> sorted = new ArrayList<>(prices);
            Collections.sort(sorted);
            Assertions.assertEquals(sorted, prices, "Products are not sorted Low-High");
        }
    },
    HILO("HI-LO", "hilo") {
        @Override
        public void validate(Page page) {
            List<Double> prices = page.locator(".inventory_item_price").allTextContents()
                    .stream()
                    .map(s -> Double.parseDouble(s.replace("$", "")))
                    .collect(Collectors.toList());
            List<Double> sorted = new ArrayList<>(prices);
            Collections.sort(sorted, Collections.reverseOrder());
            Assertions.assertEquals(sorted, prices, "Products are not sorted High-Low");
        }
    };

    private final String label;
    private final String optionValue;

    ProductSort(String label, String optionValue) {
        this.label = label;
        this.optionValue = optionValue;
    }

    public String getOptionValue() {
        return optionValue;
    }

    public abstract void validate(Page page);

    public static ProductSort fromLabel(String label) {
        for (ProductSort sort : values()) {
            if (sort.label.equalsIgnoreCase(label)) {
                return sort;
            }
        }
        return AZ; // default fallback
    }
}
