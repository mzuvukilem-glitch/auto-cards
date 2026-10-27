package com.company.automation.utils;

import com.microsoft.playwright.Page;

/**
 * Minimal accessibility (a11y) check using axe-core. Playwright for Java has no bundled axe
 * binding, so axe-core is injected into the page and run via {@code page.evaluate}.
 *
 * <p>This loads axe from a CDN for simplicity; for offline/CI determinism, bundle {@code
 * axe.min.js} under {@code src/test/resources} and inject its contents instead of the CDN URL.
 */
public final class Accessibility {

    private static final String AXE_CDN =
            "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js";

    private Accessibility() {}

    /**
     * Runs axe-core against the current page and returns the number of violations. A return of 0
     * means no violations were detected by the ruleset.
     */
    public static int violationCount(Page page) {
        page.addScriptTag(new Page.AddScriptTagOptions().setUrl(AXE_CDN));
        Object result =
                page.evaluate(
                        "async () => { const r = await axe.run(); return r.violations.length; }");
        return ((Number) result).intValue();
    }
}
