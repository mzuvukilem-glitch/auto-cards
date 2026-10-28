# CI/CD Deployment Guide

Step-by-step instructions to deploy this framework's pipelines on each supported
CI platform. For the pipeline shape and caching overview, read [CI_CD.md](CI_CD.md)
first. Because Playwright bundles its browsers, every pipeline runs on standard
hosted agents — no device or system browser needed.

## Before you start (all platforms)

1. **Push the repo** to your Git host (GitHub / GitLab / Azure Repos / Bitbucket).
2. **Configure Maven mirror credentials** as a secret if you use a private Nexus
   (see the main [README](../README.md)).
3. **Know the commands** — every pipeline just runs Maven:
   ```bash
   mvn -B clean test-compile                                   # validation, no browser
   mvn -B compile exec:java -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install --with-deps"
   mvn -B test -Dbrowser=chromium -Dheadless=true              # the run
   mvn -B allure:report                                        # render report
   ```
4. **Cache two things** for speed — `~/.m2/repository` and
   `~/.cache/ms-playwright` (browser binaries, keyed on the Playwright version).

---

## GitHub Actions

File: `.github/workflows/playwright-tests.yml` (already in the repo).

1. **Enable Actions** — repo → **Actions** tab → enable workflows if prompted.
2. **Add secrets** — **Settings → Secrets and variables → Actions**: `NEXUS_USER`
   / `NEXUS_PASS` if using a private mirror.
3. **Inject Maven creds** (only if private mirror):
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
4. **Trigger** — runs on push/PR and via **Run workflow** (pick the `browser`).
5. **Cache browsers** (optional, faster):
   ```yaml
   - uses: actions/cache@v4
     with:
       path: ~/.cache/ms-playwright
       key: playwright-${{ runner.os }}-1.47.0
   ```
6. **Cross-browser matrix** — to run all three engines in one go:
   ```yaml
   strategy:
     fail-fast: false
     matrix: { browser: [chromium, firefox, webkit] }
   steps:
     - run: mvn -B test -Dbrowser=${{ matrix.browser }} -Dheadless=true
   ```
7. **View results** — run → **Artifacts** for `allure-results`, the HTML report,
   and failure traces (plus `videos/` when recording is enabled with
   `-Drecord.video=true`, which is off by default).

---

## GitLab CI

File: `.gitlab-ci.yml` (already in the repo).

1. **Register the project** — pushing the file is enough; see **Build → Pipelines**.
2. **Runners** — all jobs use the `maven:3.9-eclipse-temurin-17` image on any
   shared runner. No special tags needed (no device).
3. **CI/CD variables** — **Settings → CI/CD → Variables**: `NEXUS_USER`,
   `NEXUS_PASS` (mark **Masked**/**Protected**).
4. **Inject Maven creds** — add a `before_script` writing `~/.m2/settings.xml`
   from those variables (same pattern as GitHub).
5. **Cross-browser** — `test:chromium`, `test:firefox`, `test:webkit` already run
   as separate jobs sharing a YAML anchor.
6. **Caching** — the file caches `.m2/repository` and `.cache/ms-playwright`
   (`PLAYWRIGHT_BROWSERS_PATH` points there). Nothing more to configure.
7. **Reports** — JUnit via `reports:junit`; the `allure-report` job publishes the
   HTML. Optionally serve it via **GitLab Pages**.

---

## Jenkins

File: `Jenkinsfile` (repo root; already in the repo).

1. **Install plugins** — **Pipeline**, **Git**, **Allure**.
2. **Configure Allure** — Manage Jenkins → Tools → add an **Allure Commandline**.
3. **Create the job** — New Item → **Pipeline** (or **Multibranch Pipeline**).
4. **Point at the Jenkinsfile** — Pipeline → *Pipeline script from SCM* → Git →
   repo URL/credentials → **Script Path** = `Jenkinsfile`.
5. **Credentials** — add Nexus username/password; reference via `withCredentials`
   or provision `~/.m2/settings.xml` on the agent.
6. **Agent** — any agent with JDK 17 + internet works (browsers download at run
   time). `PLAYWRIGHT_BROWSERS_PATH` is set to the workspace for cache reuse.
7. **Run** — **Build with Parameters** → choose `BROWSER` / `HEADLESS`. The build
   page then shows the **Allure Report** link and **Test Result** trend.

---

## Azure DevOps

File: `azure-pipelines.yml` (already in the repo).

1. **Create the pipeline** — **Pipelines → New pipeline** → select repo →
   **Existing Azure Pipelines YAML file** → `/azure-pipelines.yml`.
2. **Secrets** — **Library → Variable group** or pipeline variables: `NEXUS_USER`,
   `NEXUS_PASS` (mark secret). Link the group in YAML if used.
3. **Inject Maven creds** — a script step writing `~/.m2/settings.xml`.
4. **Agents** — all stages use `ubuntu-latest` (Microsoft-hosted). No device
   needed.
5. **Cross-browser** — the `Test` stage already runs a `matrix` over
   `chromium`/`firefox`/`webkit`; each leg uploads a per-browser report artifact.
6. **Caching** — `Cache@2` caches `~/.m2/repository`; add a second `Cache@2` for
   `~/.cache/ms-playwright` to skip browser re-downloads.
7. **Results** — `PublishTestResults@2` → **Tests** tab; `PublishBuildArtifacts@1`
   → the Allure HTML report per browser.

---

## Choosing where to run

| Need | Recommendation |
|------|----------------|
| Quickest to stand up | GitHub Actions or GitLab CI (hosted runners, zero infra) |
| Already on Azure Repos/Boards | Azure DevOps |
| On-prem / behind firewall | Jenkins or self-hosted GitLab runner |
| All browsers every run | matrix (GitLab/Azure have it built in; add to GH) |

## Post-deploy checklist

- [ ] `build` / compile stage is green (proves deps resolve).
- [ ] Browser install step runs with `--with-deps` on Linux agents.
- [ ] Maven mirror credentials injected as secrets (not in the repo).
- [ ] `~/.m2` and `~/.cache/ms-playwright` cached for speed.
- [ ] Allure report published and reachable from the run.
- [ ] Badges in the [README](../README.md) updated with your real URLs.

See also: [CI_CD.md](CI_CD.md) · [CONFIGURATION.md](CONFIGURATION.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
