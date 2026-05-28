# Render deploy — MarketX API

Repo: https://github.com/omkar-533/MarketX

## 1. Blueprint (one click)

1. Open: https://dashboard.render.com/blueprint/new?repo=https://github.com/omkar-533/MarketX
2. Connect GitHub if asked → select repo **MarketX** → branch **main**
3. Click **Deploy Blueprint** → service `marketx-api` will be created

## 2. Environment variables (Render Dashboard → marketx-api → Environment)

After first deploy, copy your Render URL (e.g. `https://marketx-api-xxxx.onrender.com`).

| Variable | Value |
|----------|--------|
| `FYERS_APP_ID` | from Fyers dashboard (e.g. `XCHF9SYUDJ-100`) |
| `FYERS_SECRET_KEY` | from Fyers dashboard |
| `FYERS_REDIRECT_URI` | `https://YOUR-SERVICE.onrender.com/api/auth/fyers/callback` |
| `API_PUBLIC_URL` | `https://YOUR-SERVICE.onrender.com` |
| `FRONTEND_URL` | your Vercel URL or `http://localhost:5173` for testing |
| `CORS_ORIGINS` | same as `FRONTEND_URL` (comma-separated if multiple) |
| `JWT_SECRET` | long random string (auto-generated if using Blueprint) |

Optional after first login:

| Variable | Value |
|----------|--------|
| `FYERS_ACCESS_TOKEN` | paste access token so restarts auto-connect (free plan has no disk) |

## 3. Fyers dashboard

Add **Redirect URI** = exact `FYERS_REDIRECT_URI` from step 2.

## 4. Verify

```text
GET https://YOUR-SERVICE.onrender.com/api/health
→ {"status":"ok",...}
```

## 5. Frontend (Vercel)

Set:

- `VITE_API_URL` = `https://YOUR-SERVICE.onrender.com`
- `VITE_WS_URL` = `https://YOUR-SERVICE.onrender.com`

Redeploy Vercel after changing env vars.
