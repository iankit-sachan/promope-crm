# PromoPe Android App

> Android WebView wrapper that loads the live PromoPe CRM website (`https://team.promope.site`) as a fully installable native Android APK.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Key Technical Concepts](#key-technical-concepts)
5. [Project Structure](#project-structure)
6. [Build System (Gradle)](#build-system-gradle)
7. [Android Components Used](#android-components-used)
8. [WebView Configuration](#webview-configuration)
9. [Chat Notifications](#chat-notifications)
10. [Security Implementation](#security-implementation)
11. [How to Build](#how-to-build)
12. [How to Install](#how-to-install)
13. [Rebuild APK Anytime](#rebuild-apk-anytime)
14. [App Details](#app-details)
15. [Troubleshooting](#troubleshooting)

---

## Project Overview

This Android app is a **WebView Wrapper** — a native Android shell that loads the existing PromoPe CRM web application inside an embedded browser. This approach was chosen because:

- The web app (`React 18 + Django`) is already fully functional and mobile-responsive
- All business logic, APIs, and real-time features remain on the backend
- Zero duplication of code — the same web codebase powers both browser and mobile
- WebSockets (real-time chat, activity feed) work natively inside Android WebView
- JWT authentication tokens persist in the WebView's `localStorage` (same as browser)

---

## Architecture

```
┌──────────────────────────────────────────┐
│         Android APK (com.promope.app)    │
│                                          │
│  SplashActivity ──► MainActivity         │
│                         │                │
│                   Android WebView        │
│                   (Chromium Engine)      │
│                         │                │
└─────────────────────────│────────────────┘
                          │ HTTPS (TLS 1.2+)
                          ▼
                   team.promope.site
                          │
                   Nginx (Reverse Proxy)
                          │
              ┌───────────┴───────────┐
              │                       │
        React Build              Django + DRF
        (Static Files)           (REST API)
                                      │
                              ┌───────┴───────┐
                              │               │
                         PostgreSQL         Redis
                         (Database)      (WebSockets)
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Language** | Kotlin | 1.9.22 | Android app language |
| **Build Tool** | Gradle | 8.4 | Build automation |
| **Android Plugin** | Android Gradle Plugin (AGP) | 8.2.2 | Android-specific build tasks |
| **Min SDK** | Android 8.0 (Oreo) | API 26 | Minimum supported Android version |
| **Target SDK** | Android 14 | API 34 | Latest tested Android version |
| **UI Engine** | Android WebView | Chromium-based | Renders the web app |
| **HTTP** | Built-in WebView networking | — | All API calls go through WebView |
| **Background HTTP** | OkHttp | 4.12.0 | REST polling in `ChatNotificationService` |
| **Layout** | XML Layouts | — | Native Android UI for splash + error screen |
| **Icons** | Adaptive Icons (XML Vector) | API 26+ | App launcher icon |
| **Theme** | Material Components | 1.11.0 | App theming (dark, status bar color) |
| **AppCompat** | AndroidX AppCompat | 1.6.1 | Backward compatibility |

---

## Key Technical Concepts

### 1. WebView
Android's `WebView` is a built-in component powered by the **Chromium engine** — the same engine used in Google Chrome. It can:
- Load any URL (local or remote)
- Execute JavaScript
- Store data in `localStorage` and `sessionStorage`
- Support WebSockets natively
- Handle cookies and sessions like a real browser

In this app, the WebView loads `https://team.promope.site` which runs the full React frontend. All user interactions (login, tasks, chat) happen inside this WebView.

---

### 2. Kotlin
Kotlin is the official modern language for Android development (recommended by Google since 2019). It is:
- Fully interoperable with Java
- More concise and safe than Java (null safety built-in)
- Compiled to JVM bytecode
- Used here for `MainActivity.kt` and `SplashActivity.kt`

---

### 3. Gradle Build System
Gradle is the build automation tool used by Android. It:
- Downloads dependencies from Maven repositories (Google, MavenCentral)
- Compiles Kotlin source files to `.class` files
- Packages resources (XML layouts, icons, strings) into the APK
- Signs the APK with a debug or release keystore
- Outputs the final `.apk` file

**Key Gradle files:**
```
build.gradle          ← Root-level: declares AGP + Kotlin plugin versions
app/build.gradle      ← App-level: SDK versions, dependencies, APK output name
gradle.properties     ← JVM args, AndroidX flag, Kotlin style
gradle/wrapper/
  gradle-wrapper.properties  ← Which Gradle version to download
  gradle-wrapper.jar         ← Bootstrap JAR to download Gradle
gradlew.bat                  ← Windows script to run Gradle without installing it globally
```

---

### 4. Android Gradle Plugin (AGP)
AGP is a Gradle plugin that adds Android-specific build tasks:
- `assembleDebug` → builds a debug APK (unsigned with debug key)
- `assembleRelease` → builds a release APK (needs signing keystore)
- `processResources` → compiles XML layouts and resources
- `mergeManifests` → merges AndroidManifest from app + libraries

---

### 5. APK (Android Package)
An `.apk` file is a ZIP archive containing:
```
app-PromoPe.apk
├── AndroidManifest.xml     ← App metadata (permissions, activities)
├── classes.dex             ← Compiled Kotlin/Java bytecode (Dalvik format)
├── res/                    ← Compiled resources (layouts, icons)
├── assets/                 ← Raw asset files
├── lib/                    ← Native .so libraries (if any)
└── META-INF/               ← Signing certificates
```

---

### 6. AndroidManifest.xml
The manifest is the app's configuration file. It declares:
- **Package name** (`com.promope.app`) — unique app ID on device and Play Store
- **Permissions** — what the app is allowed to do (INTERNET, network state)
- **Activities** — all screens in the app
- **Intent filters** — which activity opens when the app icon is tapped
- **Security flags** — cleartext traffic policy

---

### 7. Activities
An `Activity` is a single screen in an Android app. This app has two:

| Activity | Role |
|----------|------|
| `SplashActivity` | First screen shown (dark background + logo for 2 seconds) |
| `MainActivity` | Main screen containing the WebView |

**Activity Lifecycle (simplified):**
```
onCreate() → onStart() → onResume() → [visible to user]
     ↓
onPause() → onStop() → onDestroy()
```

---

### 8. Intents
An `Intent` is Android's messaging system to start activities or services.
```kotlin
// Start MainActivity from SplashActivity
val intent = Intent(this, MainActivity::class.java)
startActivity(intent)
finish()  // removes SplashActivity from back stack
```

---

### 9. Handler + Looper (Splash Delay)
`Handler(Looper.getMainLooper()).postDelayed({ ... }, 2000)` schedules code to run on the **main UI thread** after a 2000ms delay. This is how the 2-second splash screen is implemented without freezing the UI.

---

### 10. WebViewClient
`WebViewClient` intercepts WebView navigation events:
- `onPageStarted()` — fired when a page starts loading → show spinner
- `onPageFinished()` — fired when page finishes loading → hide spinner
- `onReceivedError()` — fired on network error → show offline screen
- `shouldOverrideUrlLoading()` — fired on every URL click → decide: load in WebView or open external browser

---

### 11. WebChromeClient
`WebChromeClient` handles browser chrome events (progress, dialogs):
- `onProgressChanged()` — loading progress 0–100 → hide spinner at 100%

---

### 12. DOM Storage / localStorage
`settings.domStorageEnabled = true` enables the WebView's localStorage API. This is **critical** for the app because:
- The React frontend (Zustand) stores JWT tokens in `localStorage` under key `crm-auth`
- Without this setting, users would be logged out every time the app restarts
- With this setting, login persists across app restarts (until token expires)

---

### 13. Adaptive Icons
Android 8.0+ supports adaptive icons — icons that the system can mask into different shapes (circle, squircle, rounded square) depending on the launcher:
```
mipmap-anydpi-v26/
  ic_launcher.xml        ← Adaptive icon (API 26+)
  ic_launcher_round.xml  ← Round variant

mipmap-hdpi/
  ic_launcher.png        ← PNG fallback (API < 26)
```
The adaptive icon has two layers: `background` (dark #0f172a) and `foreground` (purple "P" letter).

---

### 14. Network Connectivity Check
```kotlin
val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
val caps = cm.getNetworkCapabilities(cm.activeNetwork)
caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
```
This checks if the device has internet before loading the WebView. If no internet → shows error screen with Retry button.

---

### 15. User-Agent String
```kotlin
settings.userAgentString = settings.userAgentString + " PromoPeApp/1.0"
```
This appends a custom identifier to the WebView's HTTP User-Agent header. The Django backend can detect mobile app requests by checking for `PromoPeApp/1.0` in the `User-Agent` header.

---

### 16. Back Button Navigation
```kotlin
override fun onBackPressed() {
    if (webView.canGoBack()) webView.goBack()
    else super.onBackPressed()
}
```
Instead of closing the app on back press, this navigates back within the WebView's history — exactly like a browser back button.

---

### 17. State Saving / Restoration
```kotlin
override fun onSaveInstanceState(outState: Bundle) {
    webView.saveState(outState)
}
override fun onRestoreInstanceState(savedInstanceState: Bundle) {
    webView.restoreState(savedInstanceState)
}
```
Saves and restores the WebView's URL and history when the activity is recreated (e.g., screen rotation).

---

## Project Structure

```
android-wrapper-app/
├── app/
│   ├── build.gradle                          ← App-level build config
│   ├── proguard-rules.pro                    ← Code shrinking rules
│   └── src/main/
│       ├── AndroidManifest.xml               ← App configuration
│       ├── kotlin/com/promope/app/
│       │   ├── MainActivity.kt               ← WebView screen + JS bridge + deep link
│       │   ├── SplashActivity.kt             ← Splash screen
│       │   ├── ChatBridge.kt                 ← JS↔Native interface (window.Android)
│       │   ├── ChatNotificationService.kt    ← Background service: polls /api/chat/
│       │   └── NotificationHelper.kt         ← Notification channels, badge, alerts
│       └── res/
│           ├── layout/
│           │   ├── activity_main.xml         ← WebView + spinner + error
│           │   └── activity_splash.xml       ← Logo + app name
│           ├── drawable/
│           │   ├── ic_launcher_background.xml   ← Icon background (#0f172a)
│           │   └── ic_launcher_foreground.xml   ← Icon foreground ("P" letter)
│           ├── mipmap-anydpi-v26/            ← Adaptive icons (API 26+)
│           ├── mipmap-hdpi/                  ← 72x72px icons
│           ├── mipmap-mdpi/                  ← 48x48px icons
│           ├── mipmap-xhdpi/                 ← 96x96px icons
│           ├── mipmap-xxhdpi/                ← 144x144px icons
│           ├── mipmap-xxxhdpi/               ← 192x192px icons
│           └── values/
│               ├── strings.xml               ← App name: "PromoPe"
│               ├── colors.xml                ← #0f172a, #6366f1, #FFFFFF
│               └── themes.xml                ← Dark theme + splash theme
├── gradle/wrapper/
│   ├── gradle-wrapper.jar                    ← Gradle bootstrap binary
│   └── gradle-wrapper.properties             ← Gradle 8.4 download URL
├── build.gradle                              ← Root build config (plugin versions)
├── gradle.properties                         ← AndroidX flag, JVM args
├── settings.gradle                           ← Project name, module includes
├── gradlew.bat                               ← Windows Gradle wrapper script
└── README.md                                 ← This file
```

---

## Build System (Gradle)

### Root `build.gradle`
Declares plugin versions used across the project:
```groovy
plugins {
    id 'com.android.application' version '8.2.2' apply false
    id 'org.jetbrains.kotlin.android' version '1.9.22' apply false
}
```

### App `app/build.gradle`
Main build configuration:
```groovy
android {
    namespace 'com.promope.app'      // Package namespace
    compileSdk 34                    // Compile against Android 14 APIs
    defaultConfig {
        applicationId "com.promope.app"
        minSdk 26                    // Minimum Android 8.0
        targetSdk 34                 // Optimized for Android 14
        versionCode 1                // Integer version (increment on each release)
        versionName "1.0"            // Human-readable version
    }
    applicationVariants.all { variant ->
        variant.outputs.all {
            outputFileName = "app-PromoPe.apk"   // Custom APK filename
        }
    }
}
```

### `gradle.properties`
```properties
android.useAndroidX=true         # Use AndroidX instead of old Support Library
android.enableJetifier=true      # Auto-migrate third-party libs to AndroidX
org.gradle.jvmargs=-Xmx2048m    # 2GB RAM for Gradle daemon
```

---

## Android Components Used

| Component | Class | Description |
|-----------|-------|-------------|
| Activity | `SplashActivity` | Splash screen, 2s delay, launches MainActivity |
| Activity | `MainActivity` | Hosts the WebView, JS bridge, deep-link handler |
| View | `WebView` | Renders the React CRM web app |
| View | `ProgressBar` | Loading spinner while page loads |
| View | `LinearLayout` | Error/offline message container |
| View | `Button` | Retry button on offline screen |
| Client | `WebViewClient` | Handles page load events, errors, URL routing |
| Client | `WebChromeClient` | Handles progress updates |
| System | `ConnectivityManager` | Checks internet availability |
| System | `Handler + Looper` | Delayed execution for splash screen + poll loop |
| Bridge | `ChatBridge` | `@JavascriptInterface` — exposes `window.Android.*` to React |
| Service | `ChatNotificationService` | `ForegroundService` — polls `/api/chat/conversations/` every 30 s |
| Helper | `NotificationHelper` | Creates channels, posts/cancels notifications and badge |
| System | `NotificationManager` | Posts heads-up notifications and manages badge count |

---

## WebView Configuration

```kotlin
settings.javaScriptEnabled = true          // Required for React to run
settings.domStorageEnabled = true          // Required for JWT localStorage
settings.databaseEnabled = true            // WebSQL support
settings.loadWithOverviewMode = true       // Fit page to screen
settings.useWideViewPort = true            // Respect viewport meta tag
settings.setSupportZoom(false)             // Disable pinch-to-zoom
settings.mixedContentMode =
    WebSettings.MIXED_CONTENT_NEVER_ALLOW  // Block HTTP content in HTTPS pages
settings.cacheMode = WebSettings.LOAD_DEFAULT  // Use browser cache normally
settings.userAgentString += " PromoPeApp/1.0"  // Identify as mobile app
```

---

## Chat Notifications

Four native Android enhancements layer on top of the WebView to provide a full native chat experience even when the app is backgrounded.

---

### Overview

| Feature | Implementation | Trigger |
|---------|---------------|---------|
| JS ↔ Native bridge | `ChatBridge` + `@JavascriptInterface` | React calls `window.Android.*` |
| App icon unread badge | `NotificationChannel` with `setShowBadge(true)` | Badge notification updated on each poll |
| Background notifications | `ChatNotificationService` (ForegroundService) | REST poll detects new unread messages |
| Deep link to `/chat` | `PendingIntent` + `onNewIntent()` | User taps a chat notification |

---

### 1. JS ↔ Native Bridge (`ChatBridge.kt`)

Registered on the WebView as `window.Android`. The React app (or injected JS) calls these methods:

```kotlin
window.Android.setAuthToken(token)     // saves JWT → starts background service
window.Android.updateUnreadBadge(n)    // updates launcher-icon badge count
window.Android.clearAuthToken()        // logout cleanup: stop service, clear badge
```

**JWT extraction** — `MainActivity.onPageFinished()` injects a JS snippet that reads
`localStorage.getItem('crm-auth')`, parses the Zustand-persist shape
`{ state: { accessToken } }`, and calls `window.Android.setAuthToken(token)` automatically.
No changes to the React frontend are required.

---

### 2. Notification Channels (`NotificationHelper.kt`)

Two `NotificationChannel`s are created once in `MainActivity.onCreate()`:

| Channel ID | Name | Importance | Purpose |
|------------|------|-----------|---------|
| `chat_messages` | Chat Messages | HIGH (heads-up) | Incoming message alerts + badge |
| `chat_sync` | Chat Sync | MIN (silent) | Required foreground-service notification |

---

### 3. Background Polling Service (`ChatNotificationService.kt`)

A `ForegroundService` started by `ChatBridge.setAuthToken()` after the JWT is read.

**Poll loop (every 30 seconds):**
```
1. Read JWT from SharedPreferences (key "prefs_chat" → "jwt_token")
2. GET https://team.promope.site/api/chat/conversations/
   Header: Authorization: Bearer <jwt>
3. For each conversation, compare unread_count vs. snapshot in "prefs_chat_snapshot"
4. If unread_count grew → postChatNotification(senderName, lastMessage, convId)
                        → updateBadge(totalUnread)
5. Save new snapshot to SharedPreferences
```

- Uses **OkHttp** on a single-threaded `Executor` (no `NetworkOnMainThreadException`)
- **401 response** → stops itself silently (JWT expired); service restarts on next login
- Foreground notification (ID=2, silent `chat_sync` channel) is required by Android

---

### 4. Notification IDs

| ID | Content | Channel |
|----|---------|---------|
| `1` | Badge keeper (silent, shows unread count) | `chat_messages` |
| `2` | Foreground sync ("Checking for new messages…") | `chat_sync` |
| `1000 + convId` | Per-conversation heads-up alert | `chat_messages` |

---

### 5. Deep Link — Tap to Open Chat

Each chat notification carries a `PendingIntent` that launches `MainActivity` with:
```
action  = "com.promope.app.OPEN_CHAT"
extra   = navigate_to → "/chat"
flags   = FLAG_ACTIVITY_SINGLE_TOP | FLAG_ACTIVITY_CLEAR_TOP
```

`MainActivity` is declared `launchMode="singleTop"` so tapping the notification while the
app is already open triggers `onNewIntent()` instead of creating a new activity.
`handleChatDeepLink()` then evaluates `window.location.href='/chat'` inside the WebView.

---

### 6. New Permissions (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
```

`POST_NOTIFICATIONS` is a runtime permission on Android 13+ — the app requests it on first
launch via `requestPermissions()`.

---

### End-to-End Flow

```
App launch → onPageFinished → injectJwtExtraction JS
  → window.Android.setAuthToken(token)
    → ChatBridge stores JWT in SharedPrefs
      → starts ChatNotificationService
        → 30 s poll → GET /api/chat/conversations/
          → unread grew? → postChatNotification("Arjun Mehta", "Hey!", 9)
                         → updateBadge(1)

User taps notification
  → PendingIntent → MainActivity.onNewIntent(OPEN_CHAT)
    → webView.evaluateJavascript("window.location.href='/chat'")

User logs out
  → window.Android.clearAuthToken()
    → ChatBridge: remove JWT, stopService, cancelBadge, cancelAllChatNotifications
```

---

## Security Implementation

| Security Feature | Implementation |
|-----------------|----------------|
| HTTPS only | `android:usesCleartextTraffic="false"` in Manifest |
| No mixed content | `MIXED_CONTENT_NEVER_ALLOW` in WebView settings |
| External URLs isolated | `shouldOverrideUrlLoading()` opens non-CRM URLs in browser |
| MainActivity deep-link only | `exported="true"` but requires explicit `OPEN_CHAT` action |
| JWT stored securely | WebView localStorage sandboxed + SharedPrefs (`MODE_PRIVATE`) |
| Token auto-refresh | Handled by Axios interceptor inside WebView |
| Service auth guard | `ChatNotificationService` stops itself on 401 (expired JWT) |
| Notification permission | `POST_NOTIFICATIONS` runtime request (Android 13+) |

---

## How to Build

### Prerequisites
- Android Studio (any recent version)
- JDK 17 or higher
- Android SDK (installed via Android Studio SDK Manager)
- Internet connection (first build downloads Gradle + dependencies)

### Option 1 — Android Studio (Recommended)
```
1. Open Android Studio
2. File → Open → Select F:/CRM/android-wrapper-app
3. Wait for Gradle sync (bottom status bar)
4. Build → Build Bundle(s) / APK(s) → Build APK(s)
5. Click "locate" in the notification popup
```

### Option 2 — Command Line (Windows)
```bash
cd F:/CRM/android-wrapper-app
.\gradlew.bat assembleDebug
```

### Output
```
app/build/outputs/apk/debug/app-PromoPe.apk   (≈5.5 MB)
```

---

## How to Install

### Via USB (ADB)
```bash
# Connect phone with USB Debugging enabled
C:/Users/ankit/AppData/Local/Android/Sdk/platform-tools/adb.exe install -r app/build/outputs/apk/debug/app-PromoPe.apk
```

### Via File Transfer
1. Copy `app-PromoPe.apk` to phone storage
2. Open file manager on phone → navigate to the APK
3. Tap to install → Enable "Install from unknown sources" if prompted
4. Tap Install

---

## Rebuild APK Anytime

Whenever the website is updated (new features, bug fixes), the APK **automatically reflects those changes** because it loads the live website. No rebuild needed for website changes.

Rebuild the APK only when you change:
- App name or package ID
- Splash screen design
- App icon
- Android permissions
- Min/target SDK version
- Any Kotlin source files (`MainActivity.kt`, `ChatBridge.kt`, `ChatNotificationService.kt`, `NotificationHelper.kt`, etc.)
- Gradle dependencies (`app/build.gradle`)

**Rebuild command:**
```bash
cd F:/CRM/android-wrapper-app
.\gradlew.bat assembleDebug
```

---

## App Details

| Property | Value |
|----------|-------|
| **App Name** | PromoPe |
| **Package ID** | com.promope.app |
| **APK Filename** | app-PromoPe.apk |
| **Version** | 1.0 (versionCode: 1) |
| **Min Android** | 8.0 Oreo (API 26) |
| **Target Android** | 14 (API 34) |
| **APK Size** | ~5.5 MB |
| **Website Loaded** | https://team.promope.site |
| **Language** | Kotlin 1.9.22 |
| **Build Tool** | Gradle 8.4 + AGP 8.2.2 |
| **Theme Color** | #0f172a (slate-900) |
| **Accent Color** | #6366f1 (indigo) |
| **Orientation** | Portrait only |

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `SDK location not found` | Missing `local.properties` | Android Studio auto-creates it on first open |
| `android.useAndroidX not set` | Missing `gradle.properties` | Add `android.useAndroidX=true` to gradle.properties |
| `<adaptive-icon> requires API 26` | Adaptive XML in wrong folder | Place in `mipmap-anydpi-v26/`, not `mipmap-hdpi/` |
| Gradle sync fails | No internet / firewall | Check internet, retry sync |
| App shows blank screen | Website down or no internet | Check `https://team.promope.site` in browser |
| Login not persisting | `domStorageEnabled=false` | Ensure `settings.domStorageEnabled = true` |
| Back button exits app | WebView has no history | Expected on first page — press back again to exit |
| ADB device not found | USB Debugging off | Enable Developer Options → USB Debugging on phone |
| No chat notifications | `POST_NOTIFICATIONS` denied | Go to Settings → Apps → PromoPe → Notifications → Allow |
| Chat service not starting | User not logged in yet | Service starts only after JWT is extracted on page load |
| Notification badge not showing | Launcher doesn't support badges | Badge relies on `NotificationChannel.setShowBadge(true)` — supported on Samsung, Pixel, most OEMs |
| Notifications stop after a few hours | JWT expired (401) | Service stops itself; restart app and log in again to resume |
| Deep link not navigating to `/chat` | App was killed between notification post and tap | App relaunches normally; navigation fires in `onCreate` instead of `onNewIntent` |
