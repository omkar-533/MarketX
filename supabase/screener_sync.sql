-- Per-user saved screeners (Chartink-style). Run in Supabase SQL Editor.

create table if not exists public.screener_sync (
  user_id uuid primary key references auth.users (id) on delete cascade,
  screeners jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.screener_sync enable row level security;

drop policy if exists "screener_sync_select_own" on public.screener_sync;
drop policy if exists "screener_sync_upsert_own" on public.screener_sync;

create policy "screener_sync_select_own"
  on public.screener_sync for select
  using (auth.uid() = user_id);

create policy "screener_sync_upsert_own"
  on public.screener_sync for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
