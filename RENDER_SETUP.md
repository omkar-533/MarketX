# Render deploy — MarketX (full site + live API)

Hindi step-by-step: **[RENDER_DEPLOY_HINDI.md](./RENDER_DEPLOY_HINDI.md)**

Repo: https://github.com/omkar-533/MarketX

Build runs `npm ci && npm run build` — Node serves **API + `dist/` frontend** on one URL.

## 1. Blueprint (one click)

1. Open: https://dashboard.render.com/blueprint/new?repo=https://github.com/omkar-533/MarketX
2. Connect GitHub → repo **MarketX** → branch **main**
3. **Deploy Blueprint** → service `marketx-api`

## 2. Environment variables

Use the **same Render URL** for `FRONTEND_URL`, `API_PUBLIC_URL`, and CORS (single-host deploy).

| Variable | Value |
|----------|--------|
| `FYERS_APP_ID` | Fyers MyAPI dashboard |
| `FYERS_SECRET_KEY` | Fyers MyAPI dashboard |
| `FYERS_REDIRECT_URI` | `https://YOUR-SERVICE.onrender.com/api/auth/fyers/callback` |
| `API_PUBLIC_URL` | `https://YOUR-SERVICE.onrender.com` |
| `FRONTEND_URL` | `https://YOUR-SERVICE.onrender.com` |
| `CORS_ORIGINS` | `https://YOUR-SERVICE.onrender.com,http://localhost:5173` |
| `JWT_SECRET` | long random string |
| `FYERS_ACCESS_TOKEN` | from `node scripts/extract-fyers-token.mjs` (auto live on boot) |

## 3. Fyers dashboard

Redirect URI = exact `FYERS_REDIRECT_URI` above.

## 4. Verify

```text
GET https://YOUR-SERVICE.onrender.com/api/health
→ status ok, live.hasToken, live.wsConnected when stream up
```

Open `https://YOUR-SERVICE.onrender.com` — full app, no separate Vercel required.

## 5. Optional: Vercel frontend only

If frontend stays on Vercel, set `VITE_API_URL` and `VITE_WS_URL` to your Render URL. See `VERCEL_RENDER_DEPLOYMENT.md`.

## Always-on note

Render **free** tier sleeps after ~15 min idle. Use **Starter** plan for 24/7, or ping `/api/health` every 10–14 min (UptimeRobot).
