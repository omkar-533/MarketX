# Master TradeX — App Install (Clean · No Virus)

Yeh app **aapke khud ke code** se banti hai — koi third-party crack / mod APK nahi.

Official URL: `https://mmtt-flame.vercel.app`

---

## 1. Windows Desktop (aapka device — abhi)

### Option A — Turant chalao (install nahi)
```bash
npm install
npm run app:desktop
```
App window khulegi — live Vercel site load hogi.

### Option B — Installer (.exe)
```bash
npm install
npm run app:desktop:pack
```
File milegi: `release/Master TradeX Setup.exe`  
→ Double-click → Install → Start Menu se kholo.

**Safe kyun?** Sirf Electron shell + aapki site. Koi hidden miner / adware nahi.

---

## 2. Android Phone

### Option A — PWA (sabse easy, Play Store nahi chahiye)
1. Chrome kholo
2. `https://mmtt-flame.vercel.app` open karo
3. Menu (⋮) → **Install app** / **Add to Home screen**
4. Home screen par **TradeX** icon

### Option B — Native APK (Android Studio)
```bash
npm install
npm run app:setup
npm run app:android:open
```
Android Studio → **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
APK: `android/app/build/outputs/apk/`

---

## 3. iPhone / iPad (Apple)

### PWA (Mac ki zaroorat nahi)
1. **Safari** (Chrome nahi) → `https://mmtt-flame.vercel.app`
2. Share button → **Add to Home Screen**
3. App jaisa full-screen chalega

### Native IPA (Mac + Xcode chahiye)
```bash
npm run app:ios:sync
npm run app:ios:open
```
Xcode → Archive → TestFlight / App Store

---

## 4. Mac Desktop

- **PWA:** Chrome → site → Install
- **Electron:** Mac par `npm run app:desktop` (Node install ho)

---

## Live data

App Vercel + Render API use karti hai. Profile → **Connect Live Data** (Fyers) ek baar karo.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| Desktop blank | Internet check; Vercel URL open ho raha hai? |
| Android build fail | Android Studio + JDK 17 install |
| iOS build | Mac required; PWA use karo |
| Old UI | Hard refresh / reinstall PWA |

---

## Commands summary

| Command | Kaam |
|---------|------|
| `npm run app:desktop` | Windows/Mac app window |
| `npm run app:desktop:pack` | Windows installer |
| `npm run app:setup` | Android/iOS project setup |
| `npm run app:android:open` | Android Studio |
| `npm run build` | PWA + web deploy |
