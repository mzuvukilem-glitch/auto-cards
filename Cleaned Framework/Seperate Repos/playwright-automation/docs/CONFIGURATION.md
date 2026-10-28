# Configuration

All environment- and run-specific values live in `src/test/resources/` properties
files. Nothing is hard-coded in test or page classes.

## Files

| File | Scope | Read by |
|------|-------|---------|
| `config.properties` | base URL, browser, timeouts, credentials | `ConfigReader` |
| `junit-platform.properties` | JUnit 5 parallel execution | JUnit 5 |
| `allure.properties` | Allure results dir + link patterns | Allure |
| `log4j2.xml` | logging appenders/levels | Log4j2 |

## `config.properties`

```properties
base.url=https://www.saucedemo.com
browser=chromium            # chromium | firefox | webkit
headless=true
slowmo.ms=0                 # slow each action (ms) for debugging
viewport.width=1280
viewport.height=720
default.timeout=15000       # per-action timeout (ms)
navigation.timeout=30000    # per-navigation timeout (ms)
record.video=false          # opt-in video recording (off by default; needs ffmpeg)
environment=qa
standard.user=standard_user
standard.password=secret_sauce
```

## Override precedence

```
1. -Dkey=value  (Maven/JVM system property)   ← highest
2. config.properties entry
3. default passed to ConfigReader.get(key, default)
```

`ConfigReader` checks the system property first, so CI can change behaviour
without editing files:

```bash
mvn test -Dbrowser=webkit -Dheadless=false -Dbase.url=https://staging.example.com
```

## Typed access

`ConfigReader` exposes typed getters so callers don't parse strings:

```java
ConfigReader.get("base.url");
ConfigReader.get("browser", "chromium");          // with default
ConfigReader.getBoolean("headless", true);
ConfigReader.getInt("default.timeout", 15000);
```

`ConfigReader` keeps these same four getters, the same precedence, and the same
fail-fast validation, but is now a facade over `ConfigProvider`. Under the hood
`ConfigProvider` loads and layers the properties (base + `config.<env>.properties`
overlay) from the classpath and binds them with Spring Boot's `Binder` into a
typed, immutable `PlaywrightConfig` record. Spring is used for this binding only
— there is no application context, no beans, and no `@Autowired`. New code can use
the typed accessors directly:

```java
ConfigProvider.config().viewport().width();
ConfigProvider.config().browserOptions().headless();
ConfigProvider.config().timeouts().defaultMs();
```

Secrets (such as `api.token`) stay out of the typed config and are still resolved
by the separate `Secrets` class.

## Parallel execution (`junit-platform.properties`)

```properties
junit.jupiter.execution.parallel.enabled=true
junit.jupiter.execution.parallel.mode.default=concurrent
junit.jupiter.execution.parallel.mode.classes.default=concurrent
junit.jupiter.execution.parallel.config.strategy=dynamic
junit.jupiter.execution.parallel.config.dynamic.factor=1.0
```

- `dynamic` scales worker threads to available CPU cores × factor.
- For a fixed pool, switch to `strategy=fixed` and set
  `...config.fixed.parallelism=N`.
- Each thread gets its own browser via the ThreadLocal model — see
  [CROSS_BROWSER](CROSS_BROWSER.md).

## Browser launch & context options

Set in `PlaywrightFactory`. Common additions:

```java
// Launch options
new BrowserType.LaunchOptions()
    .setHeadless(headless)
    .setSlowMo(slowMo)
    .setArgs(List.of("--disable-dev-shm-usage"));   // CI stability

// Context options
new Browser.NewContextOptions()
    .setViewportSize(width, height)
    .setLocale("en-ZA")
    .setStorageStatePath(Paths.get("storage-state/auth.json")); // reuse login

// Video recording is opt-in (off by default) — applied only when record.video=true
if (ConfigReader.getBoolean("record.video", false)) {
    contextOptions.setRecordVideoDir(Paths.get("videos"));      // needs bundled ffmpeg
}
```

## Adding a new environment (qa / staging / prod)

Keep it data-driven:
- Add environment-specific values to `config.properties` and select with
  `-Denvironment=staging`, or
- Add per-environment files (`config.qa.properties`, …) and extend `ConfigReader`
  to load the one named by `-Denvironment`.

## Maven repository access

Dependencies resolve through a Maven mirror configured in `~/.m2/settings.xml`.
The `<server>` id must match the `<mirror>`/`<repository>` id, and the password
should be encrypted (`mvn --encrypt-password`), never stored in plain text.
If you see `401`/`429`, that's auth/rate-limiting from the mirror, not a code issue.

See also: [CROSS_BROWSER](CROSS_BROWSER.md) · [GETTING_STARTED](GETTING_STARTED.md)
