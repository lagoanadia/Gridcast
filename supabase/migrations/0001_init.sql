-- GridCast initial schema (Phase 1b target). Mirrors src/lib/types.ts.
-- Every table has user_id + RLS so the app is multi-user from day one.

create extension if not exists "pgcrypto";

create type platform as enum ('youtube', 'tiktok', 'instagram');
create type video_status as enum ('draft', 'ready', 'scheduled', 'published');
create type post_status as enum ('proposed', 'scheduled', 'publishing', 'published', 'failed', 'cancelled');
create type metric_window as enum ('24h', '7d', '28d');

create table channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  slug text not null,
  color text not null default '#c4502a',
  timezone text not null default 'Europe/Madrid',
  autopilot boolean not null default false,
  low_queue_threshold_days int not null default 5,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table platform_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  channel_id uuid not null references channels(id) on delete cascade,
  platform platform not null,
  handle text,
  external_account_id text,
  connected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (channel_id, platform)
);

-- Access tokens live apart from account metadata. RLS is enabled with NO policies,
-- so only the server (service role) can read or write them — never the browser.
create table platform_tokens (
  account_id uuid primary key references platform_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_encrypted text not null,   -- AES-256-GCM, key in TOKEN_ENCRYPTION_KEY (never in the DB)
  refresh_token_encrypted text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table platform_tokens enable row level security;

create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  channel_id uuid not null references channels(id) on delete cascade,
  platform platform not null,
  fixed_hashtags text[] not null default '{}',
  description_footer text not null default '',
  youtube_category_id text,
  language text not null default 'es',
  made_for_kids boolean not null default false,
  playlist_id text,
  tone_of_voice text not null default '',
  created_at timestamptz not null default now(),
  unique (channel_id, platform)
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  channel_id uuid not null references channels(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  storage_path text,             -- Supabase Storage object key (bucket: videos)
  file_name text,
  file_size_bytes bigint,
  duration_sec numeric,
  width int,
  height int,
  transcript text,
  status video_status not null default 'draft',
  format_tags text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on videos (user_id, channel_id, status);

create table queue_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  channel_id uuid not null references channels(id) on delete cascade,
  times text[] not null,         -- 'HH:MM' local to channel timezone
  days_of_week int[] not null,   -- 0 = Sunday
  platforms platform[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  video_id uuid not null references videos(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  platform platform not null,
  title text not null default '',
  description text not null default '',
  hashtags text[] not null default '{}',
  scheduled_at timestamptz,
  status post_status not null default 'proposed',
  attempts int not null default 0,
  next_attempt_at timestamptz,
  external_id text,
  external_url text,
  error text,
  published_at timestamptz,
  dry_run boolean,
  queue_rule_id uuid references queue_rules(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on posts (status, scheduled_at);
create index on posts (user_id, channel_id);

create table metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  post_id uuid not null references posts(id) on delete cascade,
  "window" metric_window not null,
  views bigint not null default 0,
  avg_view_duration_sec numeric,
  retention_pct numeric,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  subscribers_gained bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (post_id, "window")
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('low_queue', 'publish_failed', 'publish_retry', 'expiry')),
  channel_id uuid references channels(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  message text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'telegram')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Row Level Security: each user sees and edits only their own rows.
do $$
declare t text;
begin
  foreach t in array array['channels','platform_accounts','templates','videos','queue_rules','posts','metrics','notifications'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Private storage bucket; objects live under <user_id>/...
insert into storage.buckets (id, name, public) values ('videos', 'videos', false) on conflict do nothing;
create policy "own video files" on storage.objects for all
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
