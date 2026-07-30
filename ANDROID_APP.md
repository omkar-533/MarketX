# Wolf Trade AI — Android App

Native Android shell (Capacitor) that loads the live website: **https://wolftradeai.in**

## Install (phone)

1. Copy this file to your phone:
   - `release/android/WolfTradeAI-debug.apk`
2. On Android: allow **Install unknown apps** for Files / Chrome
3. Open the APK → Install → open **Wolf Trade AI**

Package id: `com.mastertradex.app`

## Rebuild APK (Windows)

```bash
# Needs Android SDK + Android Studio JBR
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr

npm run app:android:sync
cd android
gradlew.bat assembleDebug
```

APK output:
`android/app/build/outputs/apk/debug/app-debug.apk`

Or open Android Studio:

```bash
npm run app:android:open
```

Then: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

## Release / Play Store

Use Android Studio → **Generate Signed Bundle / APK** with your keystore.
`assembleRelease` needs a signing config in `android/app/build.gradle`.

## Notes

- App always opens the live site (not a frozen offline build). Website updates appear after refresh / relaunch.
- Internet required.
- API host: `market-api-t9co.onrender.com` (allowed in Capacitor navigation).
