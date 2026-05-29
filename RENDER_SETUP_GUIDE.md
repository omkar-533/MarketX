# Deploy on Render - Step by Step

## What is Render?
Free tier hosting for Node.js backend with persistent runtime (unlike Vercel serverless). Perfect for WebSocket + always-on processes.

---

## ✅ Step 1: Go to Render Dashboard

Open: https://dashboard.render.com

If not logged in, sign up with GitHub (recommended - direct integration).

---

## 📋 Step 2: Create New Web Service

1. Click **"New +"** button (top right)
2. Select **"Web Service"**
3. Click **"Connect a GitHub repository"**
4. Authorize Render to access GitHub
5. Search and select: **`omkar-533/MarketX`**
6. Click **"Connect"**

---

## ⚙️ Step 3: Configure Service

Render will auto-detect `render.yaml` and fill most values. Verify:

| Field | Value |
|-------|-------|
| **Name** | `marketx-api` (auto-filled) |
| **Environment** | `Node` (auto-filled) |
| **Region** | `Singapore` (auto-filled) |
| **Branch** | `main` |
| **Build Command** | `npm install` (auto-filled) |
| **Start Command** | `node server.mjs` (auto-filled) |

Click **"Create Web Service"** at the bottom.

---

## 🔐 Step 4: Set Secret Environment Variables

After service is created, go to **Settings** tab → **Environment** section.

You'll see variables already from `render.yaml`. Now fill in the **manual ones** (marked `sync: false`):

### Required Variables:

1. **FYERS_APP_ID**
   - Value: `UYCSJH0UIQ-100`

2. **FYERS_SECRET_KEY**
   - Value: `O2KU1I29DR`
   - **Type**: Change to **"Secret"** (click the lock icon)

3. **FYERS_REDIRECT_URI**
   - Value: `https://your-vercel-frontend.vercel.app/fyers-login`
   - Replace `your-vercel-frontend` with your actual Vercel project name

4. **FRONTEND_URL**
   - Value: `https://your-vercel-frontend.vercel.app`
   - Same as above

5. **API_PUBLIC_URL**
   - This will be auto-filled after deployment as: `https://marketx-api.onrender.com`
   - Or check Render dashboard - it shows your service URL
   - Value: `https://marketx-api.onrender.com` (or whatever Render gives you)

6. **CORS_ORIGINS**
   - Value: `https://your-vercel-frontend.vercel.app,http://localhost:5173`

7. **OPENROUTER_API_KEY** (optional)
   - If you use AI features, add your key

### Optional Variables:

8. **FYERS_ACCESS_TOKEN** (auto-connect without manual login)
   - First deploy without this
   - After first login in the app, run locally: `node scripts/extract-fyers-token.mjs`
   - Copy the token, come back here, add it, and Render will auto-connect

---

## 🚀 Step 5: Deploy

After setting all variables:

1. Click **"Save"** button
2. Render will automatically start deployment
3. Watch the **Logs** tab - should show:
   ```
   Master TradeX API on port 10000 (production)
   Frontend: https://your-vercel-frontend.vercel.app
   Fyers redirect: https://your-vercel-frontend.vercel.app/fyers-login
   ```

If you see errors, check logs for details.

---

## ✅ Step 6: Verify Backend is Running

Open in browser: `https://marketx-api.onrender.com/api/health`

Should show: 
```json
{"status":"ok","env":"production"}
```

If 404 or timeout:
- Wait 1-2 minutes for Render to finish deployment
- Check logs in Render dashboard for errors

---

## 📱 Step 7: Update Vercel Frontend

Go to: https://vercel.com/dashboard

Select your MarketX project → Settings → Environment Variables

Add/Update:
```
VITE_API_URL = https://marketx-api.onrender.com
```

Redeploy frontend (or it auto-redeploys on next push).

---

## 🎉 Done!

Now:
1. Open your Vercel frontend
2. Should see **live Fyers data** immediately
3. If Fyers token is set in Render env, it **auto-connects**
4. If not, Profile → Connect → complete Fyers OAuth once

---

## ❓ Troubleshooting

### Service shows "Build Failed"
- Check **Logs** tab
- Common: `npm install` failed (missing `fyers-api-v3` package?)
- Solution: Verify `package.json` has all dependencies

### "Live data offline" on frontend
- Check backend is running: `https://marketx-api.onrender.com/api/health`
- Check `VITE_API_URL` in Vercel is correct
- Check `CORS_ORIGINS` in Render includes your Vercel URL

### WebSocket fails to connect
- Check `API_PUBLIC_URL` is set to your Render URL (not localhost)
- Check `FYERS_REDIRECT_URI` matches your Vercel frontend URL

### "Fyers token invalid/expired"
- Login via Profile → Connect
- Run `node scripts/extract-fyers-token.mjs` locally
- Update `FYERS_ACCESS_TOKEN` in Render

---

## 📚 More Info
- Render Docs: https://render.com/docs
- render.yaml Format: https://render.com/docs/infrastructure-as-code
