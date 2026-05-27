/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MARKET_LIVE?: string;
  readonly VITE_PAPER_TRADING_LIVE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
