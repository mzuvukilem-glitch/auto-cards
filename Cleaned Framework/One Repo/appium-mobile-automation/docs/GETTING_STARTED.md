# Getting Started

A step-by-step guide to installing prerequisites, configuring the environment,
and running your first test.

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| JDK | 17+ | `java -version` |
| Maven | 3.9+ | `mvn -v` |
| Node.js | 18+ | required by Appium |
| Appium | 2.x | `npm i -g appium` |
| Android SDK | latest | for Android targets (set `ANDROID_HOME`) |
| Xcode | latest | for iOS targets (macOS only) |

### Install Appium drivers

```bash
appium driver install uiautomator2     # Android
appium driver install xcuitest         # iOS (macOS only)
appium driver list --installed         # verify
```

### Verify the mobile environment

```bash
npx appium-doctor            # checks Android/iOS toolchain prerequisites
adb devices                  # Android: lists connected devices/emulators
xcrun simctl list devices    # iOS: lists simulators (macOS)
```

## 2. Configure Maven repository access

Dependencies resolve through your Maven mirror. If `mvn` reports `401`/`429`,
set up credentials in `~/.m2/settings.xml` — see
[CONFIGURATION](CONFIGURATION.md#maven-repository-access) and the main
[README](../README.md#maven-settings-artifact-repository-access).

## 3. Verify the scaffold compiles (no device needed)

```bash
mvn -B clean test-compile
```

A clean exit means the framework and all dependencies are wired correctly. This
does **not** launch a device — it only compiles `src/test` (framework + tests).

## 4. Provide the app under test

Drop your builds into `src/test/resources/apps/`:

- `app-debug.apk` (Android) — referenced by `android.properties` → `appFile`
- `app.ipa` (iOS) — referenced by `ios.properties` → `appFile`

These are git-ignored by default. In CI, download them from your artifact store
before the test stage.

## 5. Start the Appium server

Either run it yourself:

```bash
appium            # listens on http://127.0.0.1:4723
```

…or let the framework start one programmatically by calling
`AppiumServerManager.start()` from your `BaseTest` (see [ARCHITECTURE](ARCHITECTURE.md)).

## 6. Run tests

```bash
# Full suite (Android + iOS blocks from testng.xml)
mvn clean test

# Single platform
mvn clean test -Dplatform=android
mvn clean test -Dplatform=ios

# A specific suite file
mvn clean test -DsuiteXmlFile=testng.xml
```

## 7. View the report

```bash
mvn allure:serve      # renders and opens the Allure report
```

See [REPORTING](REPORTING.md) for details.

## Troubleshooting first run

If something fails, check [TROUBLESHOOTING](TROUBLESHOOTING.md) — it covers the
most common issues (device not found, session not created, capabilities, waits).
