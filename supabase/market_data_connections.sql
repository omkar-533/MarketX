-- Market data connection records (read-only broker credentials).
-- Apply manually in Supabase SQL Editor when ready to persist beyond process memory.
-- Do NOT store broker passwords, OTP, or TOTP secrets.

create table if not exists public.market_data_connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null,
  status text not null default 'DISCONNECTED',
  encrypted_credential text,
  expires_at timestamptz,
  capabilities jsonb not null default '{}'::jsonb,
  mode text not null default 'DEMO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists market_data_connections_user_idx
  on public.market_data_connections (user_id);

alter table public.market_data_connections enable row level security;

-- Service role only (same pattern as app_users). No anon policies.
revoke all on public.market_data_connections from anon, authenticated;
