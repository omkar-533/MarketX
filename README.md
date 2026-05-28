# Master TradeX

Professional options trading platform — live Fyers market data, option chain, screeners, journal, and Master AI.

## Quick start

```bash
npm install
cp .env.example .env.local
# Fill FYERS_APP_ID, FYERS_SECRET_KEY, VITE_SUPABASE_* in .env.local
npm run dev
```

`npm run dev` starts **Vite + API server automatically**. The site retries `/api/health` until connected.

- **App:** http://localhost:5173  
- **API:** http://localhost:5000 (auto-started in dev)  
- **Fyers:** connect via `.env.local` token or OAuth (server reads `data/fyers-token.json`)

Alternative (explicit both processes): `npm run dev:all`

## Stack

- React + Vite + Tailwind (frontend)
- Node + Express + Socket.IO (backend)
- Fyers API v3 (market data only)
- Supabase (auth)

## Secrets

Never commit `.env.local` or `data/fyers-token.json`. Use `.env.example` as a template.
