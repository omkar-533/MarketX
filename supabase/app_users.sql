-- Run in Supabase SQL Editor. Stores app logins (admin-created invites + free-trial signups)
-- so accounts survive API restarts and redeploys.

create table if not exists public.app_users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'user',
  plan text not null default 'free',
  active boolean not null default true,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null default 'admin'
);

create index if not exists app_users_created_at_idx on public.app_users (created_at desc);

-- Only the API (service role, which bypasses RLS) may touch this table. RLS is on with
-- zero policies and grants are revoked, so the browser anon key can never read password hashes.
alter table public.app_users enable row level security;

revoke all on public.app_users from anon, authenticated;
