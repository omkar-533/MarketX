# Production deployment — Vercel + Render

## Architecture

```
Vercel (React static)  →  HTTPS API  →  Render (Node server.mjs)
                              ↓
                         Fyers REST + WebSocket
                              ↓
                         Socket.IO → browser live ticks
```

## 1. Render (API backend)

1. New **Web Service** → connect repo
2. **Start command:** `node server.mjs`
3. **Build:** `npm install`
4. Add **persistent disk** mounted at `data/` (for `fyers-token.json`)
5. Environment variables:

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | long random string |
| `FYERS_APP_ID` | `XXXX-100` |
| `FYERS_SECRET_KEY` | from Fyers dashboard |
| `FYERS_REDIRECT_URI` | `https://YOUR-API.onrender.com/api/auth/fyers/callback` |
| `FRONTEND_URL` | `https://YOUR-APP.vercel.app` |
| `CORS_ORIGINS` | `https://YOUR-APP.vercel.app` |
| `API_PUBLIC_URL` | `https://YOUR-API.onrender.com` |
| `COOKIE_SECURE` | `true` |

6. Fyers dashboard → Redirect URI = same as `FYERS_REDIRECT_URI`

## 2. Vercel (frontend)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://YOUR-API.onrender.com` |
| `VITE_WS_URL` | `https://YOUR-API.onrender.com` |
| `VITE_SUPABASE_URL` | your Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `VITE_MARKET_LIVE` | `true` |

Deploy: `npm run build` (Vite single-file output).

## 3. Automatic reconnect flow

1. **First visit:** user opens app → `GET /api/auth/session` (cookie + token file)
2. **No token:** banner → `/fyers-login` → `GET /api/auth/fyers/login` → Fyers OAuth
3. **Callback:** `GET /api/auth/fyers/callback` → saves token to `data/fyers-token.json` + HTTP-only cookie
4. **Server boot:** `bootFyersAutoConnect()` + 25s watchdog → Fyers WebSocket upstream
5. **Browser:** Socket.IO auto-reconnect + `marketTickStream` polls every 10s
6. **Reopen site:** session cookie + token file → auto live data (no paste)

## 4. Local development

```bash
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:5000 (auto-started)  
- `.env.local`: see `.env.example`

## 5. Security

- Never expose `FYERS_SECRET_KEY`, `JWT_SECRET`, or Fyers access token to the frontend
- Only `VITE_*` vars are public
- Broker session uses HTTP-only `broker_session` cookie (JWT metadata only)
