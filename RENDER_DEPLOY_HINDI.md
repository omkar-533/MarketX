# Render par deploy — Live server hamesha connect

Yeh guide **ek hi Render service** par poori website (frontend + API + Fyers live) deploy karti hai.

Repo: https://github.com/omkar-533/MarketX

---

## Step 1 — GitHub par code

Local folder se push karo (agar pehle se nahi hai):

```bash
cd C:\Users\Welcome\Desktop\mmtt
git add .
git commit -m "chore: Render full-stack deploy"
git push origin main
```

---

## Step 2 — Render Blueprint (one click)

1. Browser mein kholo:  
   **https://dashboard.render.com/blueprint/new?repo=https://github.com/omkar-533/MarketX**
2. GitHub connect karo → repo **MarketX** → branch **main**
3. **Deploy Blueprint** dabao  
4. Deploy khatam hone tak wait karo (~5–10 min pehli baar)

Service name: `marketx-api`  
URL milega jaise: `https://marketx-api-xxxx.onrender.com`

---

## Step 3 — Environment variables (zaroori)

Render Dashboard → **marketx-api** → **Environment** → neeche values daalo.

`YOUR_URL` = apna Render URL, jaise `https://marketx-api-xxxx.onrender.com`  
(**teen jagah same URL** — frontend + API ek hi server par hain)

| Variable | Value |
|----------|--------|
| `FYERS_APP_ID` | Fyers MyAPI dashboard se |
| `FYERS_SECRET_KEY` | Fyers MyAPI dashboard se |
| `FYERS_REDIRECT_URI` | `YOUR_URL/api/auth/fyers/callback` |
| `FRONTEND_URL` | `YOUR_URL` |
| `API_PUBLIC_URL` | `YOUR_URL` |
| `CORS_ORIGINS` | `YOUR_URL,http://localhost:5173` |
| `JWT_SECRET` | koi lamba random string |
| `FYERS_ACCESS_TOKEN` | neeche Step 4 se (live auto-connect ke liye) |

Optional: `OPENROUTER_API_KEY` (Master AI ke liye)

**Save** karo → Render auto **Redeploy** karega.

---

## Step 4 — Fyers token (restart ke baad bhi live)

Render **free plan** par disk save nahi hoti — isliye token env mein rakho:

**Local (ek baar login):**

```bash
npm run dev
```

Profile → TradeX / Fyers connect → login complete

Phir:

```bash
node scripts/extract-fyers-token.mjs
```

Jo token print ho, Render mein **`FYERS_ACCESS_TOKEN`** variable mein paste karo → Save → Redeploy.

---

## Step 5 — Fyers dashboard

https://myapi.fyers.in/dashboard → apni app → **Redirect URI** add karo:

```text
YOUR_URL/api/auth/fyers/callback
```

(bilkul wahi jo `FYERS_REDIRECT_URI` mein hai)

---

## Step 6 — Test

1. Browser: `YOUR_URL/api/health`  
   - `status: "ok"`  
   - `live.fyersConfigured: true` (token sahi ho to)
2. Browser: `YOUR_URL` — website khule, Heatmap par live data aaye
3. Agar token expire ho: `YOUR_URL` → Profile → dubara connect

---

## Live server “hamesha” — important

| Plan | Behaviour |
|------|-----------|
| **Free** | 15 min koi visit nahi → server **sleep**; pehli request par ~30–50 sec cold start; `FYERS_ACCESS_TOKEN` + auto-reconnect dubara stream start karta hai |
| **Starter ($7/mo)** | Server **24/7 on** — trading hours ke liye best |

Free par sleep kam karne ke liye (optional):  
UptimeRobot / cron se har **10–14 min** par `GET YOUR_URL/api/health` ping karo.

Server code mein **`startFyersAutoConnectWatch`** har 25 sec WebSocket reconnect check karta hai jab tak process chal raha ho.

---

## Sirf API Render + Frontend Vercel (alag)

Agar frontend Vercel par hai:

**Render:** upar wale vars, `FRONTEND_URL` = Vercel URL  
**Vercel env:**

```env
VITE_API_URL=https://YOUR-RENDER-URL.onrender.com
VITE_WS_URL=https://YOUR-RENDER-URL.onrender.com
VITE_MARKET_LIVE=true
```

Details: `VERCEL_RENDER_DEPLOYMENT.md`

---

## Problem?

| Issue | Fix |
|-------|-----|
| Site nahi khulti | Render → **Logs** → build error? `npm run build` local test |
| Live data off | `FYERS_ACCESS_TOKEN` set? `/api/health` → `hasToken: true` |
| Fyers login fail | Redirect URI Fyers + Render dono mein **exact same** |
| WebSocket disconnect | `API_PUBLIC_URL` = public Render URL (localhost nahi) |

---

## Quick checklist

- [ ] GitHub push `main`
- [ ] Render Blueprint deploy
- [ ] Saari env vars + `FYERS_ACCESS_TOKEN`
- [ ] Fyers Redirect URI set
- [ ] `/api/health` OK
- [ ] `YOUR_URL` par site + live heatmap
