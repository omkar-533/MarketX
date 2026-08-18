-- Every successful app login (date + time). Service role only.
-- Safe to re-run.

create table if not exists public.app_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users (id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  login_n integer
);

create index if not exists app_login_events_at_idx
  on public.app_login_events (logged_in_at desc);

create index if not exists app_login_events_user_idx
  on public.app_login_events (user_id, logged_in_at desc);

alter table public.app_login_events add column if not exists login_n integer;
alter table public.app_login_events add column if not exists last_seen_at timestamptz;
alter table public.app_login_events add column if not exists duration_ms bigint not null default 0;
alter table public.app_login_events add column if not exists ended_at timestamptz;

alter table public.app_login_events enable row level security;

revoke all on public.app_login_events from anon, authenticated;
