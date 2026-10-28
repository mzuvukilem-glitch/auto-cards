# Configuration

All environment- and platform-specific values live in properties files under
`src/test/resources/config/`. Nothing is hard-coded in test or page classes.

## Files

| File | Scope | Read by |
|------|-------|---------|
| `config.properties` | Global (platform, server URL, environment) | `ConfigReader` |
| `android.properties` | Android capabilities | `CapabilitiesBuilder` |
| `ios.properties` | iOS capabilities | `CapabilitiesBuilder` |
| `allure.properties` | Allure results dir + link patterns | Allure |
| `log4j2.xml` | Logging appenders/levels | Log4j2 |

## `config.properties`

```properties
# Default platform (android | ios)
platform=android

# Appium server endpoint
appium.server.url=http://127.0.0.1:4723
# Auto-start a local Appium server bound to the host/port above (default off;
# enable with -Dappium.server.autostart=true)
appium.server.autostart=false

# Where tests run: local (default) | browserstack | saucelabs | lambdatest |
# awsdevicefarm | perfecto. Cloud hub URL is auto-derived from this value.
device.farm=local
cloud.project=ATom Mobile   # cloud run label
cloud.build=local-build     # cloud build label
cloud.region=us-west-1      # Sauce Labs region (hub URL)
# cloud.user / cloud.key are SECRETS — pass via -D, env (CLOUD_USER/CLOUD_KEY), or .env.
# cloud.app=bs://… | storage:… | lt://…  (vendor-uploaded app; else local appFile)
# cloud.host=<your-cloud>   # Perfecto only

# Environment under test
environment=qa
base.api.url=https://qa.example.com/api
```

## `android.properties`

```properties
deviceName=Android Emulator
platformVersion=14.0
appFile=app-debug.apk
appWaitActivity=*
```

## `ios.properties`

```properties
deviceName=iPhone 15
platformVersion=17.0
appFile=app.ipa
```

`appFile` is resolved relative to `src/test/resources/apps/` by
`FrameworkConstants.APPS_PATH`.

## Override precedence

Values are resolved in this order (highest wins):

```
1. -Dkey=value  (Maven/JVM system property)   ← highest
2. config.properties entry
3. default passed to ConfigReader.get(key, default)
```

`ConfigReader` checks the system property first, so CI can change behaviour
without editing files:

```bash
mvn test -Dplatform=ios -Dappium.server.url=http://grid:4723
```

The TestNG `platform` parameter in `testng.xml` also feeds `BaseTest.setUp`, and
a `-Dplatform` override takes priority over the suite parameter.

`ConfigReader` is now a thin facade over a `ConfigProvider` that loads and layers
the properties from the filesystem (base → `config.<env>.properties` overlay →
`-D` overrides) and binds them with Spring Boot's `Binder` into a typed, immutable
`AutomationConfig` record. The precedence above and the fail-fast validation on
load are unchanged — only Spring's `Binder` is used for config binding (no
application context, no beans, no `@Autowired`).

## Typed configuration

The four static `ConfigReader` getters (`get`, `get` with default, `getBoolean`,
`getInt`) still work exactly as before. New code can instead read the typed config
record via `ConfigProvider.config()`, which avoids string keys and manual parsing:

```java
ConfigProvider.config().platform();
ConfigProvider.config().environment();
ConfigProvider.config().appium().serverUrl();
ConfigProvider.config().appium().autostart();      // typed boolean
ConfigProvider.config().cloud().farm();
ConfigProvider.config().cloud().region();
```

`CapabilitiesBuilder` reads this typed config (e.g. `config().cloud().region()`)
rather than string keys. Secrets (`cloud.user` / `cloud.key`) stay out of the
typed config and are resolved separately by the `Secrets` class.

## Adding a new capability

1. Add the key to the relevant platform properties file.
2. Read it in `CapabilitiesBuilder` and set it on the options object.

```java
// in CapabilitiesBuilder.android(...)
options.setAvd(p.getProperty("avd", "Pixel_7_API_34"));
options.setAutoGrantPermissions(
        Boolean.parseBoolean(p.getProperty("autoGrantPermissions", "true")));
```

For the full list of capabilities, see the official references:
- Android (UiAutomator2): https://github.com/appium/appium-uiautomator2-driver
- iOS (XCUITest): https://github.com/appium/appium-xcuitest-driver

## Environments (int / qa / staging / stress)

`ConfigReader` loads `config.properties` then overlays `config.<env>.properties`
when `-Denvironment=<env>` is set. Supported overlays live in
`src/test/resources/config/`:

| `-Denvironment=` | Overlay file |
|------------------|--------------|
| `int` | `config.int.properties` |
| `qa` (default) | `config.qa.properties` |
| `staging` | `config.staging.properties` |
| `stress` | `config.stress.properties` |

```bash
mvn test -Denvironment=int
mvn test -Denvironment=stress -Dplatform=ios
```

If `-Denvironment` names a value with **no** matching overlay file, the build
fails fast with a clear message rather than silently using the base target. Add a
new environment by dropping a `config.<name>.properties` file — no code change.

## Maven repository access

Dependencies resolve through a Maven mirror configured in `~/.m2/settings.xml`.
The `<server>` id must match the `<mirror>`/`<repository>` id. Store the password
encrypted, never in plain text. Full walkthrough in the main
[README](../README.md#maven-settings-artifact-repository-access).

See also: [CROSS_PLATFORM](CROSS_PLATFORM.md) · [GETTING_STARTED](GETTING_STARTED.md)
