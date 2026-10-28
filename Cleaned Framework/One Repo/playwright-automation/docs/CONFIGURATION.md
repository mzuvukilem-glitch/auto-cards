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
record.video=false          # opt-in video per context (needs ffmpeg); off by default
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

`ConfigReader` is now a thin facade over a `ConfigProvider` that loads and layers
the properties (base → `config.<env>.properties` overlay → `-D` overrides) and
binds them with Spring Boot's `Binder` into a typed, immutable `PlaywrightConfig`
record. The precedence above and the fail-fast validation on load are unchanged —
only Spring's `Binder` is used (no application context, no beans, no `@Autowired`).

## Typed access

`ConfigReader` exposes typed getters so callers don't parse strings — the facade
still works exactly as before:

```java
ConfigReader.get("base.url");
ConfigReader.get("browser", "chromium");          // with default
ConfigReader.getBoolean("headless", true);
ConfigReader.getInt("default.timeout", 15000);
```

New code can instead use the typed config record via `ConfigProvider.config()`,
which avoids string keys and manual parsing:

```java
ConfigProvider.config().baseUrl();
ConfigProvider.config().browserType();              // BrowserType enum
ConfigProvider.config().browserOptions().headless();
ConfigProvider.config().viewport().width();         // typed int
ConfigProvider.config().timeouts().defaultMs();
ConfigProvider.config().api().baseUrl();
```

Secrets (e.g. `api.token`) stay out of the typed config and are resolved
separately by the `Secrets` class.

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
Browser.NewContextOptions contextOptions = new Browser.NewContextOptions()
    .setViewportSize(width, height)
    .setLocale("en-ZA")
    .setStorageStatePath(Paths.get("storage-state/auth.json")); // reuse login

// Video is opt-in: applied only when record.video=true (default false)
if (ConfigReader.getBoolean("record.video", false)) {
    contextOptions.setRecordVideoDir(Paths.get("videos"));      // needs ffmpeg
}
```

`record.video` defaults to `false`, so no video is recorded unless you opt in
with `-Drecord.video=true`. When enabled, recordings land in `videos/`; see
[REPORTING](REPORTING.md) for how they surface in CI.

## Environments (int / qa / staging / stress)

`ConfigReader` loads `config.properties` then overlays `config.<env>.properties`
(a classpath resource) when `-Denvironment=<env>` is set. Supported overlays live
in `src/test/resources/`:

| `-Denvironment=` | Overlay file |
|------------------|--------------|
| `int` | `config.int.properties` |
| `qa` (default) | `config.qa.properties` |
| `staging` | `config.staging.properties` |
| `stress` | `config.stress.properties` |

```bash
mvn test -Denvironment=int
mvn test -Denvironment=stress -Dbrowser=firefox
```

If `-Denvironment` names a value with **no** matching overlay on the classpath,
the build fails fast with a clear message rather than silently using the base
target. Add a new environment by dropping a `config.<name>.properties` — no code change.

## Maven repository access

Dependencies resolve through a Maven mirror configured in `~/.m2/settings.xml`.
The `<server>` id must match the `<mirror>`/`<repository>` id, and the password
should be encrypted (`mvn --encrypt-password`), never stored in plain text.
If you see `401`/`429`, that's auth/rate-limiting from the mirror, not a code issue.

See also: [CROSS_BROWSER](CROSS_BROWSER.md) · [GETTING_STARTED](GETTING_STARTED.md)
