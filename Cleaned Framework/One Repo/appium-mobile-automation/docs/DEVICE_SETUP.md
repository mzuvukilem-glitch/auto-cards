# Device & Device-Cloud Setup

Where the tests actually run — a local emulator/simulator, a real device, or a
device cloud — and how to wire each one. The framework picks the target from a
single config value:

- **`device.farm`** — `local` (default), `browserstack`, `saucelabs`,
  `lambdatest`, `awsdevicefarm`, or `perfecto`. Read by `CapabilitiesBuilder`: a
  cloud value adds the vendor capability block **and auto-derives the hub URL**,
  so you only set the farm plus credentials — no separate URL to remember.
- **`appium.server.url`** — the driver's endpoint. Used as-is for `local`
  (default `http://127.0.0.1:4723`) and auto-derived for a cloud. Setting it
  explicitly (`-Dappium.server.url=…`) always overrides the derived value.

Everything is overridable with `-Dkey=value` (see [CONFIGURATION](CONFIGURATION.md)).
Per-platform device details (`deviceName`, `platformVersion`, `appFile`) come from
`src/test/resources/config/android.properties` and `ios.properties`.

| Target | `device.farm` | Hub URL (auto-derived) | Needs |
|--------|---------------|------------------------|-------|
| Local Android emulator / device | `local` | local Appium (`:4723`) | Android SDK + emulator/device |
| Local iOS simulator / device | `local` | local Appium (`:4723`) | macOS + Xcode |
| BrowserStack | `browserstack` | `hub-cloud.browserstack.com/wd/hub` | `cloud.user` / `cloud.key` |
| Sauce Labs | `saucelabs` | `ondemand.<cloud.region>.saucelabs.com/wd/hub` | `cloud.user` / `cloud.key` |
| LambdaTest | `lambdatest` | `mobile-hub.lambdatest.com/wd/hub` | `cloud.user` / `cloud.key` |
| AWS Device Farm | `awsdevicefarm` | *(set `-Dappium.server.url` to the signed grid URL)* | AWS creds + grid URL |
| Perfecto | `perfecto` | `<cloud.host>.perfectomobile.com/…/wd/hub` | `cloud.key` (token) + `cloud.host` |

---

## 1. The app binary (all targets)

Tests install an app, so provide the build first. Drop it under
`src/test/resources/apps/` and reference it from the platform properties:

- Android → `app-debug.apk` (`android.properties` → `appFile`)
- iOS → `app.ipa` or `.app` (`ios.properties` → `appFile`)

These files are git-ignored (large, environment-specific). In CI, download them
into that folder before `mvn test` (S3, artifact store, release asset). For a
device cloud you can instead upload the app to the vendor and pass its app id —
see §5.

---

## 2. Local Android (emulator or real device)

**Install once:**

```bash
npm i -g appium
appium driver install uiautomator2
# Android SDK: platform-tools (adb) + an emulator system image
```

**Emulator:**

```bash
# list AVDs, then boot one
emulator -list-avds
emulator -avd Pixel_6_API_34
adb devices            # confirm the device shows up
```

**Real device:** enable Developer Options → USB debugging, plug in over USB, and
accept the RSA prompt. Confirm with `adb devices`.

**Point the config at it** (`android.properties`):

```properties
deviceName=Pixel_6_API_34      # or the adb device id for a real device
platformVersion=14.0
appFile=app-debug.apk
appWaitActivity=*
```

**Run:**

```bash
appium            # or: mvn test -Dappium.server.autostart=true
mvn test -Dplatform=android
```

---

## 3. Local iOS (simulator or real device) — macOS only

**Install once:**

```bash
npm i -g appium
appium driver install xcuitest
# Xcode + Command Line Tools; accept the license: sudo xcodebuild -license
```

**Simulator:**

```bash
xcrun simctl list devices            # see available simulators
xcrun simctl boot "iPhone 15"
```

**Real device:** requires an Apple Developer signing identity and WebDriverAgent
provisioned for the device UDID (see the XCUITest driver docs). Trust the Mac on
the device first.

**Point the config at it** (`ios.properties`):

```properties
deviceName=iPhone 15
platformVersion=17.0
appFile=app.ipa
```

**Run:**

```bash
appium
mvn test -Dplatform=ios
```

---

## 4. Local containerized stack (Docker)

For a self-hosted CI runner or local parallel runs, the repo ships an Appium +
Android emulator stack:

```bash
docker compose -f ci/docker-compose.yml up -d
# Appium → :4723, emulator noVNC viewer → :6080, adb → :5555
mvn test -Dplatform=android        # appium.server.url already points at :4723
```

iOS cannot be containerized (it needs macOS/Xcode) — use a mac host or a cloud.

---

## 5. Device clouds

No local device needed. Set `device.farm` to a cloud and
`CapabilitiesBuilder` does the rest: it attaches the vendor's capability block
**and auto-derives the hub URL** (`resolveServerUrl`), so a cloud run is a single
flag plus credentials. Supported: `browserstack`, `saucelabs`, `lambdatest`,
`awsdevicefarm`, `perfecto`.

### Credentials & secrets

Cloud credentials are **required** for a cloud run (the build fails fast via
`Secrets.require(...)` if absent) and are **never hard-coded**. `Secrets`
resolves each key in this order (highest wins):

1. `-Dkey=value` (JVM system property)
2. environment variable — the key or its UPPER_SNAKE form
   (so `cloud.user` → `CLOUD_USER`, `cloud.key` → `CLOUD_KEY`)
3. a `.env` entry at the project root (git-ignored)

| Key | Purpose | Required |
|-----|---------|----------|
| `cloud.user` | vendor username (AWS: any non-blank marker) | yes (cloud runs; not Perfecto) |
| `cloud.key` | vendor access key / token (Perfecto: security token) | yes (cloud runs) |
| `cloud.app` | vendor-uploaded app ref (`bs://…`, `storage:…`, `lt://…`); else local `appFile` | no |
| `cloud.project` | project label | no (default `ATom Mobile`) |
| `cloud.build` | build label | no (default `local-build`) |
| `cloud.region` | Sauce Labs data-centre region (hub URL) | no (default `us-west-1`) |
| `cloud.host` | Perfecto cloud host (hub URL) | Perfecto only |

In CI, store `cloud.user` / `cloud.key` as masked secrets and expose them as
`CLOUD_USER` / `CLOUD_KEY` environment variables (or pass `-Dcloud.user=…`). Set
the target device/OS in `android.properties` / `ios.properties` (`deviceName`,
`platformVersion`) to match a device the vendor offers.

### BrowserStack

Attaches a `bstack:options` map (userName, accessKey, projectName, buildName,
sessionName). Hub URL auto-derived.

```bash
export CLOUD_USER=your_bstack_user
export CLOUD_KEY=your_bstack_key
mvn test -Dplatform=android \
  -Ddevice.farm=browserstack \
  -Dcloud.app=bs://<uploaded-app-id> \
  -Dcloud.build="$(git rev-parse --short HEAD)"
```

### Sauce Labs

Attaches a `sauce:options` map (username, accessKey, build). Hub URL auto-derived
from `cloud.region` (e.g. `us-west-1`, `eu-central-1`).

```bash
export CLOUD_USER=your_sauce_user
export CLOUD_KEY=your_sauce_key
mvn test -Dplatform=ios \
  -Ddevice.farm=saucelabs \
  -Dcloud.region=eu-central-1 \
  -Dcloud.app=storage:<uploaded-app-id> \
  -Dcloud.build="ci-$(date +%Y%m%d)"
```

### LambdaTest

Attaches an `lt:options` map (username, accessKey, project, build, w3c,
isRealMobile). Hub URL auto-derived.

```bash
export CLOUD_USER=your_lt_user
export CLOUD_KEY=your_lt_key
mvn test -Dplatform=android \
  -Ddevice.farm=lambdatest \
  -Dcloud.app=lt://<uploaded-app-id>
```

### AWS Device Farm

AWS Device Farm authenticates through a **signed, per-run grid URL** (created via
the AWS SDK/CLI), not per-session capabilities. Pass that URL explicitly:

```bash
export CLOUD_USER=aws            # non-blank marker; real auth is in the signed URL
mvn test -Dplatform=android \
  -Ddevice.farm=awsdevicefarm \
  -Dappium.server.url="<signed-grid-url-from-aws>"
```

### Perfecto

Attaches a `perfecto:options` map with the security token (`cloud.key`). The hub
URL is built from `cloud.host`:

```bash
export CLOUD_KEY=your_perfecto_security_token
mvn test -Dplatform=android \
  -Ddevice.farm=perfecto \
  -Dcloud.host=your-cloud        # → https://your-cloud.perfectomobile.com/.../wd/hub
```

### Adding another cloud

Add a `case` to both `CapabilitiesBuilder.applyDeviceFarm(...)` (the vendor
options map, from `Secrets.require(...)`) and `resolveServerUrl(...)` (the hub
URL), then run with `-Ddevice.farm=<name>`. Keep credentials in `Secrets`
(never inline).

---

## 6. Choosing a target

| Situation | Use |
|-----------|-----|
| Day-to-day local dev | Local emulator/simulator (`local`) |
| Deterministic CI without device upkeep | Device cloud (`browserstack` / `saucelabs` / `lambdatest` / `awsdevicefarm` / `perfecto`) |
| Self-hosted CI, Android only | Docker stack (§4) or a self-hosted runner |
| Highest fidelity / specific hardware | Real devices (local or cloud real-device grid) |
| iOS in CI | macOS agent, or a cloud (no containers) |

---

## 7. Troubleshooting

- **`session not created` / `Could not start a new session`** — Appium isn't
  running or `appium.server.url` is wrong (local default `:4723`); or the driver
  isn't installed (`appium driver list --installed`).
- **`Missing required secret 'cloud.user'`** — a cloud run without credentials;
  set `CLOUD_USER` / `CLOUD_KEY` (or `-Dcloud.user=…`).
- **`Unsupported device.farm: <x>`** — `device.farm` must be `local`,
  `browserstack`, `saucelabs`, `lambdatest`, `awsdevicefarm`, `perfecto` (or a
  value you've added to `CapabilitiesBuilder`).
- **`device.farm=awsdevicefarm requires an explicit appium.server.url`** — pass
  the signed grid URL with `-Dappium.server.url=…`.
- **Device not found** — `adb devices` (Android) / `xcrun simctl list` (iOS);
  make sure `deviceName` matches.
- **App not found** — the binary must be under `src/test/resources/apps/` and
  named to match `appFile`, or (cloud) a valid uploaded app id.

See also: [CONFIGURATION](CONFIGURATION.md) · [ADVANCED_FEATURES](ADVANCED_FEATURES.md) · [CI_CD](CI_CD.md) · [TROUBLESHOOTING](TROUBLESHOOTING.md)
