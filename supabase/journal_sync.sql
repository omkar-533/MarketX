-- Run in Supabase SQL Editor for Trading Journal auto cloud sync

create table if not exists public.journal_sync (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trades jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.journal_sync enable row level security;

drop policy if exists "journal_sync_select_own" on public.journal_sync;
drop policy if exists "journal_sync_upsert_own" on public.journal_sync;

create policy "journal_sync_select_own"
  on public.journal_sync for select
  using (auth.uid() = user_id);

create policy "journal_sync_upsert_own"
  on public.journal_sync for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
