# CI/CD

The framework ships ready-to-use pipelines for **four** CI platforms. All of them
follow the same shape and run the same Maven commands, so switching CI systems
changes only the YAML/Groovy wrapper, not the framework.

> **Deploying for the first time?** See [CI_DEPLOYMENT.md](CI_DEPLOYMENT.md) for
> step-by-step setup instructions for each platform (secrets, runners/agents,
> device provisioning, app binary, reports).

## CI files at a glance

| Platform | File | Notes |
|----------|------|-------|
| GitHub Actions | `.github/workflows/appium-tests.yml` | emulator via `reactivecircus/android-emulator-runner`; iOS on macOS runner |
| GitLab CI | `.gitlab-ci.yml` | device jobs are `when: manual` gates |
| Jenkins | `ci/Jenkinsfile` | declarative pipeline; Allure Jenkins plugin |
| Azure DevOps | `azure-pipelines.yml` | Build / AndroidTest / IOSTest stages |

## The common pipeline shape

```
Build (device-free)  →  Fetch app binary  →  Test (on device/emulator)  →  Publish results + Allure
```

- **Build** runs `mvn -B clean test-compile` — fast, needs no device, catches
  compile/dependency issues cheaply. Always safe to run on any shared runner.
- **Fetch app binary** downloads the `.apk`/`.ipa` into
  `src/test/resources/apps/` from your artifact store.
- **Test** runs `mvn -B test -Dplatform=android|ios`.
- **Publish** exposes JUnit results, screenshots, and the Allure report.

## The key constraint: mobile tests need a device

Unlike web automation, these tests require a real device/emulator/simulator and a
running Appium server:

- **Android** — a Linux agent with the Android SDK and an emulator (needs KVM /
  nested virtualization), or a real device, or a device cloud.
- **iOS** — a **macOS** agent with Xcode and simulators (iOS cannot run on
  Linux/Windows), or a device cloud.

Because hosted runners don't always provide these, the device jobs are either
gated (GitLab `when: manual`), guarded by a parameter (GitHub/Azure
`platform` input), or expected to target a labelled/self-hosted agent.

## GitHub Actions

`.github/workflows/appium-tests.yml` has three jobs:

- `build` — always runs `mvn clean test-compile`.
- `android` — uses `reactivecircus/android-emulator-runner@v2` to boot an
  emulator with hardware acceleration, starts Appium, and runs the Android suite.
- `ios` — runs on `macos-14`, installs the XCUITest driver, and runs the iOS suite.

Trigger a specific platform via the `workflow_dispatch` input `platform`.

## GitLab CI

`.gitlab-ci.yml` stages: `build` → `test` → `report`.

- `build` runs on the `maven:3.9-eclipse-temurin-17` image.
- `android-test` / `ios-test` are `when: manual` and expect runners tagged
  `android-emulator` or `macos, xcode` respectively.
- `allure-report` renders the HTML report from whatever results exist.
- The Maven local repo is cached via the `.m2/repository` cache key.

## Jenkins

`ci/Jenkinsfile` is a declarative pipeline with `PLATFORM` and `SUITE`
parameters. Stages: Checkout → Build → Fetch app binary → Test. The `post` block
publishes JUnit results, archives screenshots, and publishes Allure (requires the
**Allure Jenkins plugin**). Run it on an agent that has a device/emulator.

## Azure DevOps

`azure-pipelines.yml` has three stages:

- `Build` — `mvn clean test-compile` on `ubuntu-latest`.
- `AndroidTest` — runs when `platform != ios`; installs Appium, runs the Android
  suite, publishes JUnit + the Allure report.
- `IOSTest` — runs when `platform == ios` on a `macOS-14` agent.

Select the platform with the `platform` pipeline parameter.

## Providing devices (all platforms)

| Option | Android | iOS | Trade-off |
|--------|---------|-----|-----------|
| Emulator on CI agent | KVM-enabled Linux | n/a | free, but needs virtualization |
| Simulator on macOS agent | n/a | macOS + Xcode | iOS only |
| Self-hosted + real devices | USB devices | Mac + devices | best fidelity, high upkeep |
| Device cloud (BrowserStack/Sauce Labs) | yes | yes | scalable; point `appium.server.url` + caps at it |

For a device cloud, set the server URL and the cloud's capabilities via
`-D` overrides or a profile in `CapabilitiesBuilder` so local runs are unaffected:

```bash
mvn -B test -Dplatform=android -Dappium.server.url=https://hub-cloud.browserstack.com/wd/hub
```

Local Docker emulator stack (`ci/docker-compose.yml`) is handy for local parallel
runs; note Android emulators in Docker need host virtualization and iOS can't run
in Linux containers.

## Caching & stability

- Cache the Maven local repo (`~/.m2/repository`) between runs to cut downloads
  and avoid mirror `429` rate-limiting (see [TROUBLESHOOTING](TROUBLESHOOTING.md)).
- Size `testng.xml` `thread-count` to the number of devices/sessions available.
- Keep the `build` stage device-free so most failures surface without a device.

## Portable commands (any CI)

```bash
mvn -B clean test-compile          # fast validation, no device
mvn -B test -Dplatform=android     # full run (needs device + Appium)
mvn -B allure:report               # render the report
```

See also: [REPORTING](REPORTING.md) · [CONFIGURATION](CONFIGURATION.md)
