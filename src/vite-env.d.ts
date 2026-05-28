/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MARKET_LIVE?: string;
  readonly VITE_PAPER_TRADING_LIVE?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_DEV_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
