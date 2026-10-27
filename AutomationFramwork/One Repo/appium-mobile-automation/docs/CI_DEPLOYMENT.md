# CI/CD Deployment Guide

Step-by-step instructions to deploy this framework's pipelines on each supported
CI platform. For an overview of the pipeline shape and the device constraint, read
[CI_CD.md](CI_CD.md) first.

## Before you start (all platforms)

1. **Push the repo** to your Git host (GitHub / GitLab / Azure Repos / Bitbucket).
2. **Decide where devices come from** — mobile tests need a device/emulator and a
   running Appium server. Pick one:
   - Android emulator on a Linux agent (needs KVM / nested virtualization)
   - iOS simulator on a macOS agent (Xcode required)
   - Real devices on a self-hosted agent
   - A device cloud (BrowserStack / Sauce Labs / LambdaTest)
3. **Provide the app binary** — wire a step to download your `.apk`/`.ipa` into
   `src/test/resources/apps/` (artifact store, S3, release asset, …).
4. **Configure Maven mirror credentials** as a secret if you use a private Nexus
   (see the main [README](../README.md#maven-settings-artifact-repository-access)).
5. **Know the override flags** — every pipeline just runs Maven:
   ```bash
   mvn -B clean test-compile                 # device-free validation
   mvn -B test -Dplatform=android|ios        # the actual run
   mvn -B allure:report                      # render report
   ```

---

## GitHub Actions

File: `.github/workflows/appium-tests.yml` (already in the repo).

1. **Enable Actions** — on GitHub, open the repo → **Actions** tab → enable
   workflows if prompted. The workflow auto-registers from the committed file.
2. **Add secrets** — repo → **Settings → Secrets and variables → Actions**:
   - `NEXUS_USER` / `NEXUS_PASS` (if using a private Maven mirror)
   - any device-cloud keys (e.g. `BROWSERSTACK_USER` / `BROWSERSTACK_KEY`)
3. **Expose secrets to Maven** — add an env block or a `settings.xml` step. Example:
   ```yaml
   - name: Maven settings
     run: |
       mkdir -p ~/.m2
       cat > ~/.m2/settings.xml <<'EOF'
       <settings><servers><server>
         <id>nexus</id><username>${{ secrets.NEXUS_USER }}</username>
         <password>${{ secrets.NEXUS_PASS }}</password>
       </server></servers></settings>
       EOF
   ```
4. **Wire the app download** — replace the "Fetch app binary" step with your real
   command (e.g. `aws s3 cp ...` using cloud credentials from secrets).
5. **Choose the trigger** — it runs on push/PR and via **Run workflow**
   (`workflow_dispatch`) where you pick `platform`.
6. **Android acceleration** — the `android` job uses
   `reactivecircus/android-emulator-runner`; GitHub's Linux runners support KVM,
   so the emulator boots hardware-accelerated out of the box.
7. **iOS** — the `ios` job runs on `macos-14`. Costs more minutes; trigger it only
   when `platform: ios`.
8. **View results** — open the run → **Artifacts** for `allure-results` /
   `allure-report`; the Checks tab shows pass/fail.

---

## GitLab CI

File: `.gitlab-ci.yml` (already in the repo).

1. **Register the project** — pushing the file is enough; GitLab picks it up under
   **Build → Pipelines**.
2. **Provide runners**:
   - `build` runs on any shared runner (uses the `maven` image).
   - `android-test` expects a runner **tagged** `android-emulator` (SDK + KVM).
   - `ios-test` expects a runner **tagged** `macos, xcode`.
   Register a self-hosted runner and add those tags:
   ```bash
   gitlab-runner register --tag-list "android-emulator"
   ```
3. **Add CI/CD variables** — **Settings → CI/CD → Variables**: `NEXUS_USER`,
   `NEXUS_PASS`, device-cloud keys. Mark them **Masked** (and **Protected** for
   protected branches).
4. **Inject Maven creds** — add a `before_script` that writes `~/.m2/settings.xml`
   from those variables (same pattern as GitHub above).
5. **Device jobs are gated** — `android-test` / `ios-test` use `when: manual`, so
   pipelines don't block when no device runner is free. Start them from the
   pipeline view when a device is available, or remove the `rules: when: manual`
   once you have dedicated runners.
6. **App binary** — add your download command into the device job's `script`.
7. **Reports** — JUnit results surface via `reports:junit`; the `allure-report`
   job publishes the HTML as an artifact. Optionally publish it to **GitLab Pages**.

---

## Jenkins

File: `ci/Jenkinsfile` (already in the repo).

1. **Install plugins** — Manage Jenkins → Plugins: **Pipeline**, **Git**,
   **Allure**, and (for parameters) **Pipeline: Declarative**.
2. **Configure Allure** — Manage Jenkins → Tools → add an **Allure Commandline**
   installation so the `allure` step can render.
3. **Create the job** — New Item → **Pipeline** (or **Multibranch Pipeline** to
   auto-discover branches/PRs).
4. **Point at the Jenkinsfile** — Pipeline → *Pipeline script from SCM* → Git →
   your repo URL/credentials → **Script Path** = `ci/Jenkinsfile`.
5. **Add credentials** — Manage Jenkins → Credentials: Nexus username/password and
   any device-cloud keys; reference them with `withCredentials` in a stage, or
   provision `~/.m2/settings.xml` on the agent.
6. **Pick an agent with a device** — the `Test` stage needs a device/emulator and
   Appium. Label such an agent and change `agent any` to `agent { label 'mobile' }`.
7. **App binary** — replace the echo in the "Fetch app binary" stage with your
   real download.
8. **Run** — **Build with Parameters** → choose `PLATFORM` / `SUITE`. After the
   run, the **Allure Report** link appears on the build page; JUnit trends show
   under **Test Result**.

---

## Azure DevOps

File: `azure-pipelines.yml` (already in the repo).

1. **Create the pipeline** — Azure DevOps → **Pipelines → New pipeline** → select
   your repo → **Existing Azure Pipelines YAML file** → pick
   `/azure-pipelines.yml`.
2. **Add secrets** — **Pipelines → Library → Variable group** (or pipeline
   variables): `NEXUS_USER`, `NEXUS_PASS`, device-cloud keys. Mark secret ones as
   🔒. Link the variable group in the YAML if you use one.
3. **Inject Maven creds** — add a script step that writes `~/.m2/settings.xml` from
   the variables (same pattern as the other platforms).
4. **Agents**:
   - `Build` and `AndroidTest` use `ubuntu-latest` (Microsoft-hosted).
   - `IOSTest` uses `macOS-14`.
   - For Android emulator acceleration or real devices, register a **self-hosted
     agent** and change the `pool` to that agent.
5. **App binary** — replace the echo "Fetch app binary" step with your download.
6. **Select platform** — the `platform` pipeline parameter is prompted on manual
   runs and drives which stage executes.
7. **Results** — `PublishTestResults@2` surfaces JUnit under the run's **Tests**
   tab; `PublishBuildArtifacts@1` uploads the Allure HTML report as an artifact.

---

## Device-cloud quick wiring (any platform)

To run against a cloud instead of a local device, point the server URL and pass
the cloud's capabilities, keeping secrets in the CI secret store:

```bash
mvn -B test -Dplatform=android \
  -Dappium.server.url=https://hub-cloud.browserstack.com/wd/hub
```

Add the cloud's required capabilities (user/key/app id) in `CapabilitiesBuilder`
behind an env switch so local runs stay unaffected.

## Post-deploy checklist

- [ ] `build` / compile stage is green (proves deps resolve).
- [ ] Maven mirror credentials injected as secrets (not in the repo).
- [ ] App binary download step points at your real artifact store.
- [ ] A device/emulator source is wired (agent, emulator action, or cloud).
- [ ] Allure report is published and reachable from the run.
- [ ] Badges in the [README](../README.md) updated with your real URLs.

See also: [CI_CD.md](CI_CD.md) · [CONFIGURATION.md](CONFIGURATION.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
