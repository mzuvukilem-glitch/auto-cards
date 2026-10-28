# CI/CD Deployment & Run Guide

A single, end-to-end guide for deploying and running **both** automation
frameworks on every supported CI/CD platform:

- **`playwright-automation`** — web UI + API tests. Playwright bundles its own
  browsers, so it runs on **standard hosted agents** (no device needed).
- **`appium-mobile-automation`** — mobile UI tests. These need a **device or
  emulator/simulator** plus a running **Appium server**, which shapes every
  pipeline.

Supported platforms: **GitHub Actions**, **GitLab CI**, **Jenkins**, **Azure
DevOps**. Every pipeline is a thin wrapper around the same Maven commands, so
switching CI systems changes the wrapper, not the frameworks.

> Each framework also ships its own focused deployment notes:
> `playwright-automation/docs/CI_DEPLOYMENT.md` and
> `appium-mobile-automation/docs/CI_DEPLOYMENT.md`. This document is the
> cross-framework companion.

---

## 1. Repository layout (standalone projects)

In this layout the two frameworks are **fully standalone** — there is no shared
parent POM and no shared commons module. Each project declares its own
dependency versions and the shared helper classes (`Secrets`, `RunMetadata`,
`JsonUtils`) are inlined into each project's own source tree. That means CI can
build either framework directly from its own folder with **no pre-install step**:

```bash
cd playwright-automation && mvn -B clean test-compile
# or
cd appium-mobile-automation && mvn -B clean test-compile
```

Treat each framework as its own pipeline/repository. If both live in one Git
repo, give each its own CI definition scoped to its folder.

---

## 2. The Maven commands every pipeline runs

| Purpose | Command |
|---------|---------|
| Device/browser-free validation | `mvn -B clean test-compile` |
| Install Playwright browsers | `mvn -B compile exec:java -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install --with-deps"` |
| Run Playwright tests | `mvn -B test -Dbrowser=<chromium\|firefox\|webkit> -Dheadless=true` |
| Run Appium tests | `mvn -B test -Dplatform=<android\|ios>` |
| Render the Allure report | `mvn -B allure:report` |

Useful overrides (system property wins over `config.properties`):

- Playwright: `-Dbrowser=`, `-Dheadless=`, `-Dbase.url=`, `-Denvironment=`,
  `-Drecord.video=true` (video is **off by default**).
- Appium: `-Dplatform=`, `-DsuiteXmlFile=` (e.g. `testng.xml` /
  `quarantine.xml`), `-Dappium.server.url=` (point at a device cloud).

---

## 3. Prerequisites & secrets (all platforms)

1. **Push the repo** to your Git host (GitHub / GitLab / Azure Repos / Bitbucket).
2. **Maven mirror credentials** — if you resolve dependencies through a private
   Nexus, store `NEXUS_USER` / `NEXUS_PASS` as CI secrets and inject them into
   `~/.m2/settings.xml` (snippet in §8). Never commit credentials.
3. **Appium only — decide where devices come from:**
   - Android emulator on a Linux agent (needs KVM / nested virtualization)
   - iOS simulator on a macOS agent (Xcode required)
   - Real devices on a self-hosted agent
   - A device cloud (BrowserStack / Sauce Labs / LambdaTest)
4. **Appium only — provide the app binary** — add a step that downloads your
   `.apk` / `.ipa` into `src/test/resources/apps/`. The committed pipelines have
   a placeholder "Fetch app binary" step.
5. **Caching** — cache `~/.m2/repository` everywhere; additionally cache
   `~/.cache/ms-playwright` (Playwright browser binaries, keyed on the Playwright
   version) for the web framework.

---

## 4. GitHub Actions

Committed workflows:

- `playwright-automation/.github/workflows/playwright-tests.yml`
- `appium-mobile-automation/.github/workflows/appium-tests.yml`

### 4.1 Playwright (web) — deploy & run

1. **Enable Actions** — repo → **Actions** tab → enable workflows if prompted.
2. **Add secrets** — **Settings → Secrets and variables → Actions**: `NEXUS_USER`
   / `NEXUS_PASS` if using a private mirror.
3. **What it does** — on push/PR (and manual **Run workflow** with a `browser`
   choice) it sets up JDK 17 with Maven cache, installs browsers with OS deps,
   runs the suite headless, renders Allure, and uploads `allure-results`, the
   HTML report, and — on failure — `videos/` and `test-results/`
   (videos exist only when you run with `-Drecord.video=true`).
4. **Full cross-browser matrix** in one run:
   ```yaml
   strategy:
     fail-fast: false
     matrix: { browser: [chromium, firefox, webkit] }
   steps:
     - run: mvn -B test -Dbrowser=${{ matrix.browser }} -Dheadless=true
   ```
5. **Cache browsers** (optional, faster):
   ```yaml
   - uses: actions/cache@v4
     with:
       path: ~/.cache/ms-playwright
       key: playwright-${{ runner.os }}-1.47.0
   ```
6. **View results** — open the run → **Artifacts** for `allure-results` /
   `allure-report`; the **Checks** tab shows pass/fail.

### 4.2 Appium (mobile) — deploy & run

1. **What it does** — a device-free `build` job (`mvn -B clean test-compile`)
   always runs; then either:
   - **`android`** — runs on `ubuntu-latest` using
     `reactivecircus/android-emulator-runner@v2` (GitHub Linux runners support
     KVM, so the emulator is hardware-accelerated). Installs Appium + the
     `uiautomator2` driver, boots the emulator, starts Appium, runs
     `-Dplatform=android`.
   - **`ios`** — runs on `macos-14`, installs Appium + the `xcuitest` driver,
     starts Appium, runs `-Dplatform=ios` (triggered only when the
     `workflow_dispatch` input `platform: ios`).
2. **Wire the app download** — replace the "Fetch app binary" step with your real
   command (e.g. `aws s3 cp s3://builds/app-debug.apk src/test/resources/apps/`).
3. **Secrets** — add `NEXUS_*` and any device-cloud keys (e.g.
   `BROWSERSTACK_USER` / `BROWSERSTACK_KEY`).
4. **Pick the platform** — use **Run workflow** and choose `android` (default) or
   `ios`. iOS consumes more (pricier) macOS minutes, so trigger it deliberately.
5. **View results** — run → **Artifacts** for `android-results` / `ios-results`
   (Allure results + HTML report + `screenshots/`).

---

## 5. GitLab CI

Committed files:

- `playwright-automation/.gitlab-ci.yml`
- `appium-mobile-automation/.gitlab-ci.yml`

### 5.1 Playwright (web)

- **Stages:** `build` → `test` → `report`.
- `build` compiles on `maven:3.9-eclipse-temurin-17`.
- `test:chromium`, `test:firefox`, `test:webkit` share a YAML anchor
  (`.test-template`); each installs browsers and runs its engine. Results +
  `videos/` are uploaded; JUnit XML is surfaced via `reports:junit`.
- `allure-report` renders the HTML report.
- Caches both `.m2/repository` and `.cache/ms-playwright` (via
  `PLAYWRIGHT_BROWSERS_PATH`).

**Deploy:** push the file (GitLab auto-registers it under **Build → Pipelines**);
all jobs run on any shared runner with the `maven` image. Add `NEXUS_USER` /
`NEXUS_PASS` under **Settings → CI/CD → Variables** (**Masked**, **Protected**)
and inject them via a `before_script` that writes `~/.m2/settings.xml` (§8).

### 5.2 Appium (mobile)

- **Stages:** `build` → `test` → `report`.
- `build` is device-free on a shared runner.
- `android-test` needs a runner **tagged** `android-emulator` (SDK + KVM);
  `ios-test` needs one **tagged** `macos, xcode`. Both are gated with
  `rules: when: manual` so pipelines don't block when no device runner is free.
- Both device jobs install Appium + the matching driver, start Appium, and run
  `-Dplatform=…`; artifacts are `target/allure-results` + `screenshots/` with
  JUnit via `reports:junit`.
- `allure-report` renders the HTML.

**Deploy:** register a self-hosted runner with the required tags:
```bash
gitlab-runner register --tag-list "android-emulator"
# and, on a Mac host:
gitlab-runner register --tag-list "macos,xcode"
```
Add your app-binary download into the device job's `script`. Start the manual
device jobs from the pipeline view once a device is available (or drop the
`when: manual` rule once you have dedicated runners).

---

## 6. Jenkins

Committed files:

- `playwright-automation/Jenkinsfile` (repo-root of that framework)
- `appium-mobile-automation/ci/Jenkinsfile`

Shared setup:

1. **Install plugins** — **Pipeline**, **Git**, **Allure** (and **Pipeline:
   Declarative**).
2. **Configure Allure** — Manage Jenkins → Tools → add an **Allure Commandline**
   so the `allure` post step can render.
3. **Credentials** — Manage Jenkins → Credentials: Nexus username/password and
   any device-cloud keys; reference them with `withCredentials`, or provision
   `~/.m2/settings.xml` on the agent.

### 6.1 Playwright (web)

- Declarative pipeline with `BROWSER` (chromium/firefox/webkit) and `HEADLESS`
  parameters. Stages: **Checkout → Build → Install browsers → Test → Allure
  report**. It pins `PLAYWRIGHT_BROWSERS_PATH` inside the workspace for cache
  reuse. The `post { always }` block publishes JUnit, archives
  `videos/**` and the Allure HTML, and publishes Allure.
- **Create the job** — New Item → **Pipeline** (or **Multibranch Pipeline**) →
  *Pipeline script from SCM* → Git → **Script Path** = `Jenkinsfile`.
- Runs on `agent any` (no device needed). **Build with Parameters** → pick the
  browser/headless; the **Allure Report** link and **Test Result** trend appear
  on the build page.

### 6.2 Appium (mobile)

- Declarative pipeline with `PLATFORM` (android/ios) and `SUITE` (TestNG suite
  file, default `testng.xml`) parameters. Stages: **Checkout → Build → Fetch app
  binary → Test**. `post { always }` publishes JUnit, archives
  `screenshots/**/*.png`, and publishes Allure.
- **Script Path** = `ci/Jenkinsfile`.
- **Pick an agent with a device** — the `Test` stage needs a device/emulator +
  Appium. Label such an agent and change `agent any` to
  `agent { label 'mobile' }`. Replace the echo in "Fetch app binary" with your
  real download.

---

## 7. Azure DevOps

Committed files:

- `playwright-automation/azure-pipelines.yml`
- `appium-mobile-automation/azure-pipelines.yml`

**Create each pipeline:** **Pipelines → New pipeline** → select the repo →
**Existing Azure Pipelines YAML file** → pick the framework's
`azure-pipelines.yml`. Store `NEXUS_*` and device-cloud keys in a **Library →
Variable group** (mark secrets) and inject `~/.m2/settings.xml` with a script step
(§8).

### 7.1 Playwright (web)

- Stages: **Build** → **Test**.
- `Build` runs `mvn -B clean test-compile` on `ubuntu-latest` with a `Cache@2`
  for `~/.m2/repository`.
- `Test` runs a **matrix** over `chromium` / `firefox` / `webkit`; each leg
  installs browsers, runs its engine headless, renders Allure, publishes JUnit
  (`PublishTestResults@2`), and uploads a per-browser `allure-report-<engine>`
  artifact.

### 7.2 Appium (mobile)

- Stages: **Build** → **AndroidTest** / **IOSTest** (selected by the `platform`
  pipeline parameter).
- `Build` and `AndroidTest` use `ubuntu-latest`; `IOSTest` uses `macOS-14`.
- Each device stage installs Appium + the matching driver, has a "Fetch app
  binary" placeholder to replace, runs `-Dplatform=…`, and publishes JUnit. For
  emulator acceleration or real devices, register a **self-hosted agent** and
  change the `pool`.

---

## 8. Injecting private Maven credentials (any platform)

When dependencies resolve through a private Nexus, write `~/.m2/settings.xml`
from CI secrets before the Maven build. Example (shell; adapt to each platform's
secret syntax):

```bash
mkdir -p ~/.m2
cat > ~/.m2/settings.xml <<EOF
<settings>
  <servers>
    <server>
      <id>nexus</id>
      <username>${NEXUS_USER}</username>
      <password>${NEXUS_PASS}</password>
    </server>
  </servers>
</settings>
EOF
```

The `<server><id>` must match the mirror/repository id Maven uses. Prefer an
encrypted password (`mvn --encrypt-password`). A `401`/`429` from the mirror is
auth/rate-limiting, not a code failure.

---

## 9. Running against a device cloud (Appium)

To run on a cloud instead of a local device/emulator, point the Appium server URL
at the hub and pass the cloud's capabilities (kept in the CI secret store):

```bash
mvn -B test -Dplatform=android \
  -Dappium.server.url=https://hub-cloud.browserstack.com/wd/hub
```

Add the cloud's required capabilities (user / key / app id) in
`CapabilitiesBuilder` behind an env switch so local runs stay unaffected.

For a local Appium + Android emulator stack (handy for a self-hosted runner or
local parallel runs), the repo ships `appium-mobile-automation/ci/docker-compose.yml`:

```bash
docker compose -f appium-mobile-automation/ci/docker-compose.yml up -d
# Appium on :4723, emulator noVNC on :6080, adb on :5555
```

---

## 10. Reports & artifacts

- **Allure** — every pipeline writes raw results to `target/allure-results` and
  renders HTML to `target/site/allure-maven-plugin` via `mvn allure:report`.
  Upload both; optionally publish the HTML to GitHub/GitLab Pages for a hosted,
  linkable report with history.
- **JUnit/TestNG XML** — `target/surefire-reports/TEST-*.xml` surfaces native
  pass/fail trends on each platform.
- **Playwright** — failure `videos/` (only when `-Drecord.video=true`) and
  traces.
- **Appium** — failure `screenshots/`.

---

## 11. Choosing where to run

| Need | Recommendation |
|------|----------------|
| Quickest to stand up (web) | GitHub Actions or GitLab CI — hosted runners, zero infra |
| Web, all browsers every run | Matrix (GitLab/Azure have it built in; add to GH) |
| Mobile, hardware-accelerated Android | GitHub Actions (`android-emulator-runner` on KVM runners) |
| Mobile, iOS | A macOS agent (GitHub `macos-14`, Azure `macOS-14`) or a device cloud |
| On-prem / behind a firewall | Jenkins or a self-hosted GitLab runner |
| Already on Azure Repos/Boards | Azure DevOps |

---

## 12. Post-deploy checklist

- [ ] `build` / compile stage is green (proves deps resolve).
- [ ] Maven mirror credentials injected as secrets (never committed).
- [ ] **Web:** `~/.m2` and `~/.cache/ms-playwright` cached; browser install uses
      `--with-deps` on Linux.
- [ ] **Mobile:** a device/emulator source is wired (agent, emulator action, or
      cloud) and the app-binary download points at your real artifact store.
- [ ] Allure report is published and reachable from the run.
- [ ] (Web, optional) `-Drecord.video=true` set only where you want video; it is
      off by default.
- [ ] CI badges in each framework's `README.md` updated with real URLs.

---

### See also

- `playwright-automation/docs/CI_CD.md` · `playwright-automation/docs/CI_DEPLOYMENT.md`
- `appium-mobile-automation/docs/CI_CD.md` · `appium-mobile-automation/docs/CI_DEPLOYMENT.md`
