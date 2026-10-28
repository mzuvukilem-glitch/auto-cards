# Locators & UI Interactions Reference

A complete catalogue of Playwright **locator strategies** and **UI interactions**,
with examples. The runnable, heavily-commented source lives in:

- `src/test/java/com/company/automation/pages/examples/LocatorShowcase.java`
- `src/test/java/com/company/automation/pages/examples/InteractionShowcase.java`

These are reference classes (not real screens). In production, store locators as
fields on a `*Page` and act through `BasePage` helpers — see
[WRITING_TESTS](WRITING_TESTS.md).

> **Locators are lazy and auto-waiting.** Creating a `Locator` runs no query; the
> query executes (and waits for actionability) only when you act on it. This makes
> locators reusable and resilient.

---

## Locator strategies

### User-facing (preferred — resilient to markup changes)

| Strategy | Example | Notes |
|----------|---------|-------|
| `getByRole` | `page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Log in"))` | **Top recommendation.** Role + accessible name. |
| `getByRole` (regex name) | `...setName(Pattern.compile("^Checkout$"))` | Exact/regex name matching. |
| `getByText` | `page.getByText("Welcome back")` | Visible text (substring by default). |
| `getByText` (exact) | `page.getByText("Welcome back", new Page.GetByTextOptions().setExact(true))` | Exact match. |
| `getByLabel` | `page.getByLabel("Password")` | Form control by its `<label>`. |
| `getByPlaceholder` | `page.getByPlaceholder("Username")` | Input by placeholder. |
| `getByAltText` | `page.getByAltText("Company logo")` | Images by alt text. |
| `getByTitle` | `page.getByTitle("Close dialog")` | Element by `title` attribute. |
| `getByTestId` | `page.getByTestId("login-button")` | Uses the configured `testIdAttribute` (`data-test`). Stable, explicit. |

### Engine selectors

| Strategy | Example | Notes |
|----------|---------|-------|
| CSS | `page.locator("#login-button")` | Fast, familiar; prefer stable ids/attributes. |
| CSS (attribute) | `page.locator("input[name='email']")` | Attribute match. |
| XPath | `page.locator("xpath=//button[normalize-space()='Log in']")` | Use only when CSS/role can't express it; slow, brittle. |

### Filtering & chaining

| Technique | Example | Notes |
|-----------|---------|-------|
| `filter(hasText)` | `locator.filter(new Locator.FilterOptions().setHasText("Backpack"))` | Narrow a set by contained text. |
| `filter(has)` | `locator.filter(new Locator.FilterOptions().setHas(page.getByText("Remove")))` | Items containing a child match. |
| Chaining | `page.locator(".inventory_item").getByRole(AriaRole.BUTTON)` | Scope a search inside a parent. |
| Indexing | `.first()` · `.last()` · `.nth(2)` | Pick within a matched set. |

### Frames & shadow DOM

| Case | Example | Notes |
|------|---------|-------|
| iframe | `page.frameLocator("#payment-frame").getByLabel("Card number")` | Enter the frame, then locate. |
| Shadow DOM | `page.locator("css=...")` | Open shadow roots are pierced automatically — no special syntax. |

### Choosing a strategy (stability order)

```
getByRole  >  getByLabel / getByPlaceholder / getByText / getByTestId  >  CSS  >  XPath
```

Prefer locators tied to how a user perceives the element (role, label, text) over
structural selectors.

---

## UI interactions

> Actions **auto-wait** for actionability (attached, visible, stable, enabled).
> Verify with **web-first assertions** (`PlaywrightAssertions.assertThat(...)`),
> which retry until the condition holds or times out — this removes almost all
> need for explicit waits/sleeps.

### Navigation

| Interaction | Example |
|-------------|---------|
| Go to URL | `page.navigate("https://...")` |
| Reload | `page.reload()` |
| Back / forward | `page.goBack()` / `page.goForward()` |
| Wait for load state | `page.waitForLoadState(LoadState.NETWORKIDLE)` |

### Basic input

| Interaction | Example |
|-------------|---------|
| Click | `locator.click()` |
| Double / right / multi click | `dblclick()` · `click(setButton(RIGHT))` · `click(setClickCount(2))` |
| Force click (bypass checks) | `click(new Locator.ClickOptions().setForce(true))` |
| Fill | `locator.fill("value")` (preferred) |
| Clear | `locator.clear()` |
| Type key-by-key | `locator.pressSequentially("text", setDelay(100))` |
| Press key / chord | `locator.press("Enter")` · `locator.press("Control+A")` |
| Page-level keyboard | `page.keyboard().type("...")` |

### Form controls

| Interaction | Example |
|-------------|---------|
| Checkbox / radio | `check()` · `uncheck()` · `isChecked()` |
| Dropdown | `selectOption("ZA")` · `selectOption(new String[]{"ZA","US"})` |
| File upload | `setInputFiles(Paths.get("..."))`; clear with an empty `Path[]` |

### Reading state

| Interaction | Example |
|-------------|---------|
| Text | `locator.textContent()` |
| Input value | `locator.inputValue()` |
| Attribute | `locator.getAttribute("id")` |
| Visibility / enabled | `isVisible()` · `isEnabled()` |
| Count | `locator.count()` |
| All texts | `locator.allTextContents()` |

### Mouse / pointer

| Interaction | Example |
|-------------|---------|
| Hover | `locator.hover()` |
| Low-level mouse | `page.mouse().move/down/up(...)` |
| Drag & drop | `source.dragTo(target)` |

### Waiting (rarely needed)

| Interaction | Example |
|-------------|---------|
| Element visible | `locator.waitFor()` |
| Navigation | `page.waitForURL("**/inventory.html")` |
| Selector | `page.waitForSelector("#container")` |

### Web-first assertions (idiomatic verification)

```java
PlaywrightAssertions.assertThat(button).isVisible();
PlaywrightAssertions.assertThat(field).hasValue("standard_user");
PlaywrightAssertions.assertThat(page).hasURL(Pattern.compile(".*inventory.*"));
PlaywrightAssertions.assertThat(page).hasTitle("Swag Labs");
```

### Dialogs, tabs, network

| Interaction | Example |
|-------------|---------|
| Dialog (alert/confirm) | register `page.onDialog(d -> d.accept())` **before** triggering it |
| New tab / popup | `Page popup = page.waitForPopup(() -> link.click())` |
| Wait for response | `page.waitForResponse("**/api/cart", () -> addToCart.click())` |

### Screenshots / scroll

| Interaction | Example |
|-------------|---------|
| Full-page screenshot | `page.screenshot(setPath(...).setFullPage(true))` |
| Element screenshot | `locator.screenshot(setPath(...))` |
| Scroll into view | `locator.scrollIntoViewIfNeeded()` |

---

## From reference to production

1. Store the locator as a field on a real `*Page` (constructed in the ctor).
2. Expose intent-revealing methods annotated with `@Step`, returning the next page.
3. Verify with web-first `PlaywrightAssertions` in the test, not in the page.

See also: [WRITING_TESTS](WRITING_TESTS.md) · [CROSS_BROWSER](CROSS_BROWSER.md) · [ARCHITECTURE](ARCHITECTURE.md)
