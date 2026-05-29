# Supabase + Vercel login fix (Hindi)

Agar **Sign In / Google / Sign Up** kaam nahi kar raha, ye steps **Supabase Dashboard** me karo:

## 1. URL Configuration

https://supabase.com/dashboard → project **ubrqgbjljswiyugfaaex** → **Authentication** → **URL Configuration**

| Field | Value |
|-------|--------|
| **Site URL** | `https://mmtt-flame.vercel.app` |
| **Redirect URLs** (Add each) | `https://mmtt-flame.vercel.app/**` |
| | `http://localhost:5173/**` |

**Save**

## 2. Google login (optional)

**Authentication** → **Providers** → **Google** → Enabled

Google Cloud Console me **Authorized redirect URI** ye hona chahiye:

```
https://ubrqgbjljswiyugfaaex.supabase.co/auth/v1/callback
```

## 3. Email sign-up

Project me **email confirm** ON hai (`mailer_autoconfirm: false`).

- Sign up ke baad **email inbox / spam** me confirmation link kholo
- Phir **Sign In** karo

Ya **Authentication** → **Providers** → **Email** → "Confirm email" off karo (testing ke liye).

## 4. Phone OTP

OTP ke liye Supabase me **Twilio** configure hona chahiye. Bina Twilio ke Phone OTP fail hoga.

## 5. Turant login (admin — bina email confirm)

| Email | Password |
|-------|----------|
| `omkarchauhan533@gmail.com` | `Omkar@12345` |

## 6. Vercel env (already set)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Change ke baad: Vercel **Redeploy** production.
