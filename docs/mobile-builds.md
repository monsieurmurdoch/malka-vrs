# Mobile Build Setup

## App Identifiers

The first mobile test lanes use these identifiers:

| App | iOS bundle ID | Android application ID | Android flavor |
| --- | --- | --- | --- |
| MalkaVRS | `com.malkacomm.vrs` | `com.malkacomm.vrs` | `malkaVrs` |
| MalkaVRI | `com.malkacomm.vri` | `com.malkacomm.vri` | `malkaVri` |
| MapleVRI | `com.maplecomm.vri` | `com.maplecomm.vri` | `mapleVri` |

The canonical mapping lives in `config/mobile-app-identifiers.json`.

Current mobile scope is exactly these three client apps. MalkaVRI and MapleVRI
share the same VRI client codepath and differ by tenant skin/config. There is no
interpreter, captioner, or terp portal app in the current mobile stage.

## Android

Android uses Gradle product flavors in `android/app/build.gradle`.

Local build environment used by Codex:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
export PATH="/opt/homebrew/opt/gradle@7/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"
```

Android Studio owns the SDK at `$HOME/Library/Android/sdk`. Homebrew's
`android-commandlinetools` package is only used for `sdkmanager`/`avdmanager`
when Android Studio does not install those command-line tools into the SDK root.

Example local build commands:

```sh
cd android
gradle :app:assembleMalkaVrsDebug -x :app:runMalkaVrsDebugReactPackager
gradle :app:assembleMalkaVriDebug -x :app:runMalkaVriDebugReactPackager
gradle :app:assembleMapleVriDebug -x :app:runMapleVriDebugReactPackager
```

Release/internal testing builds use the matching release variants:

```sh
cd android
gradle :app:bundleMalkaVrsRelease
gradle :app:bundleMalkaVriRelease
gradle :app:bundleMapleVriRelease
```

The checked-in `gradlew` currently lacks `android/gradle/wrapper/gradle-wrapper.jar`, so use a local Gradle 8.9 binary until the wrapper is restored.

As of the local setup pass on 2026-05-01, the Pixel 9 AVD boots and the
MalkaVRS debug flavor builds and installs:

```sh
cd android
gradle :app:assembleMalkaVrsDebug -x runMalkaVrsDebugReactPackager
adb install -r app/build/outputs/apk/malkaVrs/debug/app-malkaVrs-debug.apk
adb reverse tcp:8081 tcp:8081
npx react-native start --port 8081 --reset-cache
adb shell am start -n com.malkacomm.vrs/org.jitsi.meet.MainActivity
```

Android device builds currently package only `arm64-v8a`, which is the phone ABI
validated for Android 15+/16 KB page-size devices. Emulator-only x86/x86_64
support should be handled separately if needed later, because every bundled ABI
must pass the same native-library alignment audit.

Run the bundled APK/AAB ELF alignment check after Android builds:

```sh
npm run mobile:check-android-16kb -- --all android/app/build/outputs/apk/malkaVrs/debug/app-malkaVrs-debug.apk
```

Current 2026-05-01 audit result: the MalkaVRS, MalkaVRI, and MapleVRI debug
APKs build under React Native 0.77.3, AGP 8.7.2, and NDK r28. All three pass
`zipalign -P 16 -c -v 4`, and the ELF audit reports `arm64-v8a: 13/13
compatible`.

Current 2026-05-02 release audit result: the MalkaVRS, MalkaVRI, and MapleVRI
release AABs build successfully and pass the same ELF audit with `arm64-v8a:
13/13 compatible`.

The current Android debug launch reaches the simplified MalkaVRS client login
screen after Metro loads. Treat full login/profile/call-flow parity as open
until the emulator and device smoke checks are completed.

Google Play app records should be created with the Android application IDs above.

## iOS

The Xcode app target defaults to MalkaVRS. For other tenants, pass build settings at build/archive time:

```sh
cd ios
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild \
  -workspace jitsi-meet.xcworkspace \
  -scheme JitsiMeet \
  -configuration Debug \
  MOBILE_APP_DISPLAY_NAME=MapleVRI \
  MOBILE_BUNDLE_IDENTIFIER=com.maplecomm.vri \
  MOBILE_APP_GROUP_IDENTIFIER=group.com.maplecomm.vri.appgroup \
  MOBILE_URL_SCHEME=maplevri
```

Use the same variables for MalkaVRI:

```sh
MOBILE_APP_DISPLAY_NAME=MalkaVRI
MOBILE_BUNDLE_IDENTIFIER=com.malkacomm.vri
MOBILE_APP_GROUP_IDENTIFIER=group.com.malkacomm.vri.appgroup
MOBILE_URL_SCHEME=malkavri
```

Full Xcode is selected locally at `/Applications/Xcode.app/Contents/Developer`.

Apple Developer/App Store Connect app records should be created with the iOS bundle IDs above. If screen sharing remains enabled, also create the matching broadcast extension IDs:

- `com.malkacomm.vrs.broadcast.extension`
- `com.malkacomm.vri.broadcast.extension`
- `com.maplecomm.vri.broadcast.extension`

The app group identifiers above must also exist in the Apple Developer portal before device signing will work.
