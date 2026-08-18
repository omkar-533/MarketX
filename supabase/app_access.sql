-- Run in Supabase SQL Editor AFTER supabase/app_users.sql.
-- Adds mobile verification, the 3-day trial / access gate, OTP codes,
-- access requests (screenshot proof) and admin-editable settings.

/* ── app_users: mobile + access control + login tracking ── */

alter table public.app_users add column if not exists phone text;
alter table public.app_users add column if not exists phone_verified boolean not null default false;
alter table public.app_users add column if not exists access_status text not null default 'trial';
alter table public.app_users add column if not exists access_expires_at timestamptz;
alter table public.app_users add column if not exists plan_id text;
alter table public.app_users add column if not exists first_login_at timestamptz;
alter table public.app_users add column if not exists last_login_at timestamptz;
alter table public.app_users add column if not exists login_count integer not null default 0;
alter table public.app_users add column if not exists admin_seen_at timestamptz;

-- One account per mobile number, but legacy rows without a number stay valid.
create unique index if not exists app_users_phone_key
  on public.app_users (phone)
  where phone is not null;

-- Logins created before the trial system existed must not get locked out.
update public.app_users
   set access_status = 'granted',
       access_expires_at = null
 where trial_ends_at is null
   and access_status = 'trial';

-- Trial signups already in the table: mirror their trial end into the new gate.
update public.app_users
   set access_expires_at = trial_ends_at
 where trial_ends_at is not null
   and access_expires_at is null;

/* ── OTP codes for mobile verification ── */

create table if not exists public.app_otp_codes (
  id text primary key,
  phone text not null,
  code_hash text not null,
  purpose text not null default 'signup',
  payload jsonb,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_otp_codes_phone_idx
  on public.app_otp_codes (phone, created_at desc);

/* ── Access requests: user uploads proof, admin approves ── */

create table if not exists public.app_access_requests (
  id text primary key,
  user_id text not null references public.app_users (id) on delete cascade,
  name text,
  email text,
  phone text,
  screenshot_path text,
  screenshot_data text,
  note text,
  status text not null default 'pending',
  admin_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Optional legacy column (demat is primarily stored in note). Safe if already absent.
alter table public.app_access_requests
  add column if not exists trading_view_id text;

create index if not exists app_access_requests_status_idx
  on public.app_access_requests (status, created_at desc);

create index if not exists app_access_requests_user_idx
  on public.app_access_requests (user_id, created_at desc);

/* ── Admin-editable settings (offer popup config lives here) ── */

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.app_settings (key, value)
values (
  'access_popup',
  jsonb_build_object(
    'enabled', true,
    'title', 'Unlock full access',
    'message', 'Create an account on the link below, then upload a screenshot. We will unlock your access after a quick check.',
    'url', '',
    'buttonLabel', 'Open link',
    'whatsapp', '',
    'defaultGrantDays', 30
  )
)
on conflict (key) do nothing;

/* ── Private bucket for the proof screenshots ── */

insert into storage.buckets (id, name, public)
values ('access-proofs', 'access-proofs', false)
on conflict (id) do nothing;

/* ── Only the API (service role) may touch these tables ── */

alter table public.app_otp_codes enable row level security;
alter table public.app_access_requests enable row level security;
alter table public.app_settings enable row level security;

revoke all on public.app_otp_codes from anon, authenticated;
revoke all on public.app_access_requests from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;

/* ── Per-login timestamps for the admin desk ── */

create table if not exists public.app_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users (id) on delete cascade,
  logged_in_at timestamptz not null default now()
);

create index if not exists app_login_events_at_idx
  on public.app_login_events (logged_in_at desc);

create index if not exists app_login_events_user_idx
  on public.app_login_events (user_id, logged_in_at desc);

alter table public.app_login_events enable row level security;
revoke all on public.app_login_events from anon, authenticated;
