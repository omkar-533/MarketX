import type { CapacitorConfig } from '@capacitor/cli';

/** Live app URL — always latest UI + Render API (no stale bundle) */
const LIVE_APP_URL = process.env.CAPACITOR_SERVER_URL || 'https://mmtt-flame.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.mastertradex.app',
  appName: 'Master TradeX',
  webDir: 'dist',
  server: {
    url: LIVE_APP_URL,
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'mmtt-flame.vercel.app',
      'market-api-t9co.onrender.com',
      '*.supabase.co',
      'localhost',
      '127.0.0.1',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0a0e17',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0e17',
    },
  },
};

export default config;
