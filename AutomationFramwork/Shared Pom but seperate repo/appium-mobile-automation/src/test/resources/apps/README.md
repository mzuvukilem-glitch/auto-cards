# App binaries

Place the application builds under test here:

- `app-debug.apk` — Android build (referenced by `android.properties` → `appFile`)
- `app.ipa` — iOS build (referenced by `ios.properties` → `appFile`)

These files are git-ignored by default (see `.gitignore`) because they are large
and environment-specific. In CI, download them from your artifact store into this
folder before `mvn test`.
