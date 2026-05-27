# Master TradeX

Professional options trading platform — live Fyers market data, option chain, screeners, journal, and Master AI.

## Quick start

```bash
npm install
cp .env.example .env.local
# Fill FYERS_APP_ID, FYERS_SECRET_KEY, VITE_SUPABASE_* in .env.local
npm run dev:all
```

- **App:** http://localhost:5173  
- **API:** http://localhost:5000  
- **Fyers:** Profile → Connect after server start

## Stack

- React + Vite + Tailwind (frontend)
- Node + Express + Socket.IO (backend)
- Fyers API v3 (market data only)
- Supabase (auth)

## Secrets

Never commit `.env.local` or `data/fyers-token.json`. Use `.env.example` as a template.
