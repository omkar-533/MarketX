-- Every successful app login (date + time). Service role only.
-- Safe to re-run.

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
