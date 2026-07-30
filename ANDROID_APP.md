# Wolf Trade AI — Android / Play Store

Native Capacitor app that loads **https://wolftradeai.in**

Package id: `com.mastertradex.app`

## Play Store upload file (AAB)

Signed Android App Bundle (required by Play Console):

- Desktop: `WolfTradeAI-PlayStore.aab`
- Project: `release/android/WolfTradeAI-PlayStore.aab`

Also signed release APK (sideload / testing):

- Desktop: `WolfTradeAI-release.apk`

### Upload steps

1. Open [Google Play Console](https://play.google.com/console)
2. Create app → **Wolf Trade AI**
3. Complete store listing (title, short/full description, screenshots, icon 512×512)
4. Add a **Privacy Policy** URL (required)
5. **Production** (or Internal testing) → Create release → Upload the `.aab`
6. Review → Roll out

### Keystore (CRITICAL)

Backup file on Desktop:

`WolfTradeAI-PlayStore-KEYSTORE-BACKUP.txt`

+ keystore:

`android/keystore/wolftradeai-release.jks`

**Back these up offline.** Lost keystore = you cannot update this Play Store listing with new versions.

Never commit `.jks` / `keystore.properties` / the backup txt to Git.

## Rebuild Play Store bundle

```bat
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr

npm run app:android:sync
cd android
gradlew.bat bundleRelease
gradlew.bat assembleRelease
```

Outputs:

- `android/app/build/outputs/bundle/release/app-release.aab`
- `android/app/build/outputs/apk/release/app-release.apk`

## Debug APK (direct phone install)

`WolfTradeAI-debug.apk` on Desktop / `release/android/`

## Notes

- App needs internet; it opens the live website.
- Each Play Store update: bump `versionCode` + `versionName` in `android/app/build.gradle`
