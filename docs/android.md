# Android app

The Android app is the same React app running in a Capacitor shell, with native Java for everything a
web page can't do well. Native code lives in `android/app/src/main/java/com/phacharapol/dayplanner/`.

| Native piece | What it does |
|---|---|
| `PlannerStore` | Holds a snapshot of yesterday through the day after tomorrow (pushed by the web app) and a queue of actions taken outside the app |
| `Scheduler` + `AlarmReceiver` | Keeps **one** alarm armed for the next moment that matters (a reminder, a block starting or ending, midnight). Uses exact timing when allowed and falls back to inexact otherwise. Re-arms after reboot and after time or timezone changes |
| `Notifier` | Heads-up reminders with **Done** / **+15 min** buttons, plus the ongoing **Now card** with a live countdown |
| `NowWidget`, `AgendaWidget` | Home-screen widgets for "Now & next" and "Today" (light and dark) |
| `CalendarReader` | Read-only events from the calendars on the phone (Google, Outlook, Samsung…) |
| `QuickAddTileService` | Quick Settings tile that opens quick add |
| `MainActivity` | Share → Day Planner puts the text in the inbox; `dayplanner://` deep links |

The web app stays the single source of truth. Anything done natively (Done, +15 min, share) is queued
and applied the next time the app runs, and the snapshot is also updated straight away so widgets
and notifications reflect it immediately.

## Build

You don't need anything installed. Every push runs **.github/workflows/android.yml**, which:

1. builds `app-debug.apk` and runs Android lint (download it from the run's **Artifacts**),
2. installs it on an Android 14 emulator and runs `scripts/android-smoke.mjs`. That script drives the app's WebView and checks the Now card, the Done button, share, deep links, the back button, widgets, alarms, phone calendars and logcat crashes. Screenshots are saved in the `android-smoke` artifact,
3. builds a **signed `app-release.aab`** for Google Play, but only when the signing secrets below exist.

To build locally (Android Studio, or the JDK 21 + Android SDK command-line tools):

```bash
npm ci && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk
```

## Signing for Google Play (one-time)

1. Create an upload key on your computer and keep the file and passwords somewhere safe:
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```
2. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | output of `base64 -w0 upload.jks` (on a Mac: `base64 -i upload.jks`) |
   | `ANDROID_KEYSTORE_PASSWORD` | keystore password |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | key password |
3. Push, or re-run the workflow. The run's artifacts now include `app-release-aab`.
4. In the [Play Console](https://play.google.com/console) ($25 one-time developer fee), create the app, turn on **Play App Signing**, and upload the `.aab` to the **Internal testing** track first.

`versionCode` is the workflow run number, so every build is newer than the last. `versionName` is set in `android/app/build.gradle`.

## Permissions and Play policy notes

- `POST_NOTIFICATIONS`: asked for only when you turn on reminders or the Now card.
- `SCHEDULE_EXACT_ALARM`: not granted by default on Android 14+. The app works without it (reminders may be a few minutes late) and Settings links to the system screen to allow it. It does **not** use `USE_EXACT_ALARM`, which Play restricts to alarm-clock and calendar apps.
- `READ_CALENDAR`: asked for only when you tap **Show my phone's calendars**. Events are read on the device and never uploaded. Declare this in Play's **Data safety** form as "Calendar events — not collected, not shared (processed on device only)".
- `RECEIVE_BOOT_COMPLETED`: re-arms reminders after a restart.

## Known platform behaviour: Play services restarts

Android kills any app that holds a *stable* link to a content provider when that provider's process dies.
Android System WebView (inside this app's process, like every WebView app) fetches some fonts from Google
Play services' font provider the first time it renders text, holding such a link for a moment (measured on
the API 34 emulator: none in a fresh process, none with native views, a stable link only while the WebView
first renders, none in steady state). If Play services restarts in that window, typically while it updates
itself, Android restarts the app. Plans live in local storage, so nothing is lost. The app itself adds no
such dependency (AppCompat's EmojiCompat initializer is removed), and the CI device test fails if the app
holds a stable link in steady state or dies when Play services is killed.
