# Vercel + Render Deployment Guide

## Architecture
- **Frontend** (React + Vite) → Vercel
- **Backend** (Express + Node) → Render
- **Database** (optional) → Supabase

## Frontend Deployment (Vercel)

### 1. Set Environment Variables in Vercel Dashboard

Go to https://vercel.com/dashboard → select your project → Settings → Environment Variables

Add these variables:

```env
VITE_API_URL=https://your-backend-render-url.onrender.com
MARKET_LIVE=true
MARKET_PROVIDER=fyers
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxx
```

### 2. Vercel `vercel.json` (Already Updated)

✓ Already configured for frontend build + rewrite

```bash
npm run build  # Creates dist/
```

### 3. Deploy to Vercel

```bash
npm install -g vercel
vercel deploy --prod
```

---

## Backend Deployment (Render)

### 1. Create Render Service

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Fill details:
   - **Name**: `marketx-backend` (or your choice)
   - **Environment**: Node
   - **Build Command**: `npm install` (leave as is, no build needed)
   - **Start Command**: `node server.mjs`
   - **Region**: Choose closest to your users (e.g., India: Singapore)

### 2. Set Environment Variables in Render Dashboard

After creating the service, go to **Settings** → **Environment** → Add these:

```env
NODE_ENV=production
PORT=10000
FYERS_APP_ID=UYCSJH0UIQ-100
FYERS_SECRET_KEY=O2KU1I29DR
FYERS_REDIRECT_URI=https://your-frontend-vercel-url.vercel.app/fyers-login
FRONTEND_URL=https://your-frontend-vercel-url.vercel.app
API_PUBLIC_URL=https://your-backend-render-url.onrender.com
CORS_ORIGINS=https://your-frontend-vercel-url.vercel.app,http://localhost:5173
COOKIE_SECURE=true
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxx
FYERS_ACCESS_TOKEN=your-saved-token-from-first-login
```

> **Important**: Copy `FYERS_ACCESS_TOKEN` from `data/fyers-token.json` after first successful login locally, then paste here. This enables auto-connect on backend boot.

### 3. Deploy

Push to GitHub:
```bash
git add .
git commit -m "chore: prepare for render deployment"
git push origin main
```

Render will auto-deploy on every push.

---

## Frontend → Backend Connection

Update your frontend API config at [src/config/api.ts](src/config/api.ts):

```typescript
// Should automatically use VITE_API_URL from .env
const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
```

This is already configured ✓

---

## Testing Flow

### Local Development
```bash
npm run dev  # Boots both frontend (5173) + backend (5000)
```

### After Vercel + Render Deploy

1. Open `https://your-frontend-vercel-url.vercel.app`
2. You should see live data from Fyers
3. If Fyers token was set in Render env, it auto-connects
4. If not yet connected, Profile → Connect → redirects to Fyers OAuth → auto-saves token

---

## Troubleshooting

### "Live data offline" on Deployed Site

1. **Check backend is running**: Open `https://your-backend-render-url.onrender.app/api/health` in browser
   - Should show: `{"status":"ok","env":"production"}`

2. **Check env vars in Render**:
   - Verify all Fyers vars are set
   - Check `API_PUBLIC_URL` is correct

3. **Check Vercel frontend env vars**:
   - Verify `VITE_API_URL` points to correct Render backend URL
   - Deploy again if updated

4. **Backend logs**: Go to Render dashboard → Logs tab
   - Look for "[FyersAuto] Token expired/invalid" or connection errors

### WebSocket Connection Fails

Make sure `API_PUBLIC_URL` in Render is set to your public Render URL (not localhost).

---

## Optional: Persistent Token Storage (Supabase)

Instead of env vars, save token to Supabase DB for better persistence:

Create [server/services/tokenStore.mjs](server/services/tokenStore.mjs):

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function saveToken(token) {
  const { error } = await supabase
    .from('fyers_tokens')
    .upsert({ id: 1, token, updated_at: new Date() });
  if (error) throw error;
}

export async function loadToken() {
  const { data, error } = await supabase
    .from('fyers_tokens')
    .select('token')
    .eq('id', 1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.token || '';
}
```

Then update [server/market/fyersSession.mjs](server/market/fyersSession.mjs) to use this instead of file storage. (Can implement on demand)

---

## Summary Checklist

- [ ] Update `vercel.json` (Done ✓)
- [ ] Vercel Dashboard: Set `VITE_API_URL` to Render backend URL
- [ ] Render: Create Web Service from GitHub
- [ ] Render: Set all environment variables (copy from `.env.local`)
- [ ] Push to GitHub
- [ ] Verify `/api/health` returns 200 on Render
- [ ] Verify frontend loads live data
- [ ] Login to Fyers once to save token
- [ ] Token now persists on Render for auto-reconnect

---

## Questions?

- Render won't start? Check logs in Render dashboard
- Frontend can't reach backend? Verify `VITE_API_URL` and CORS settings
- Token expires? Login again via Profile → Connect, or save token in Render env

