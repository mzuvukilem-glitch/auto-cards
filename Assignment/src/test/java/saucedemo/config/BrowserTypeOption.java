package saucedemo.config;

    public enum BrowserTypeOption {
        CHROMIUM, FIREFOX, WEBKIT;
        // Static helper method to process text safely
        public static BrowserTypeOption fromString(String value) {
            if (value == null) {
                return CHROMIUM; // Default fallback
            }
            try {
                return BrowserTypeOption.valueOf(value.trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                System.out.println("Warning: Invalid browser value '" + value + "'. Defaulting to CHROMIUM.");
                return CHROMIUM; // Error fallback
            }
        }
        }
