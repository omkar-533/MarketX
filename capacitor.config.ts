import type { CapacitorConfig } from '@capacitor/cli';

/** Live app URL — GitHub Pages while Vercel daily deploy limit is exhausted */
const LIVE_APP_URL =
  process.env.CAPACITOR_SERVER_URL || 'https://omkar-533.github.io/MarketX/';

const config: CapacitorConfig = {
  appId: 'com.mastertradex.app',
  appName: 'AI Powered Market Intelligent',
  webDir: 'dist',
  server: {
    url: LIVE_APP_URL,
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'omkar-533.github.io',
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
