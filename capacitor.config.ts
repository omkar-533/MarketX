import type { CapacitorConfig } from '@capacitor/cli';

/** Live app URL — custom domain */
const LIVE_APP_URL = process.env.CAPACITOR_SERVER_URL || 'https://wolftradeai.in';

const config: CapacitorConfig = {
  appId: 'com.mastertradex.app',
  appName: 'Wolf Trade AI',
  webDir: 'dist',
  server: {
    // Loads the live website inside the native shell (full product = same as web).
    url: LIVE_APP_URL,
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'wolftradeai.in',
      'www.wolftradeai.in',
      'omkar-533.github.io',
      'mmtt-flame.vercel.app',
      '*.vercel.app',
      'market-api-t9co.onrender.com',
      '*.onrender.com',
      '*.supabase.co',
      'localhost',
      '127.0.0.1',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0a0e17',
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1600,
      launchAutoHide: true,
      backgroundColor: '#0a0e17',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0e17',
    },
  },
};

export default config;
