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

## Adding a new environment (qa / staging / prod)

Keep environment switches data-driven. Options:

- Add environment-specific values to `config.properties` and select via
  `-Denvironment=staging`, reading them in `ConfigReader`.
- Or add per-environment files (`config.qa.properties`, `config.staging.properties`)
  and extend `ConfigReader` to load the file named by `-Denvironment`.

## Maven repository access

Dependencies resolve through a Maven mirror configured in `~/.m2/settings.xml`.
The `<server>` id must match the `<mirror>`/`<repository>` id. Store the password
encrypted, never in plain text. Full walkthrough in the main
[README](../README.md#maven-settings-artifact-repository-access).

See also: [CROSS_PLATFORM](CROSS_PLATFORM.md) · [GETTING_STARTED](GETTING_STARTED.md)
