-- Indicator library: members get invite links; admin CRUD via service role.
-- Access: 3-day trial demo, then admin grant for longer (handled by app_users access).

create table if not exists public.app_indicators (
  id text primary key,
  title text not null,
  description text not null default '',
  code text not null default '',
  link text not null default '',
  image_path text,
  image_data text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text
);

-- Existing installs: add link column and copy any old code values that look like URLs.
alter table public.app_indicators add column if not exists link text not null default '';

-- Optional how-to guidance video (YouTube / Vimeo / direct mp4 URL).
alter table public.app_indicators add column if not exists how_to_video_url text not null default '';

update public.app_indicators
set link = code
where coalesce(nullif(trim(link), ''), '') = ''
  and code ~* '^https?://';

create index if not exists app_indicators_published_sort_idx
  on public.app_indicators (published, sort_order asc, created_at desc);

insert into storage.buckets (id, name, public)
values ('indicators-media', 'indicators-media', false)
on conflict (id) do nothing;

alter table public.app_indicators enable row level security;

revoke all on public.app_indicators from anon, authenticated;
