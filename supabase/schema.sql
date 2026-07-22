create extension if not exists pgcrypto;

create table if not exists worker_sessions (
  name text primary key default 'telegram',
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

create table if not exists source_channels (
  id uuid primary key default gen_random_uuid(),
  telegram_channel text not null unique,
  enabled boolean not null default true,
  last_message_id bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references source_channels(id) on delete cascade,
  telegram_message_id bigint not null,
  file_name text,
  caption text,
  file_size bigint,
  normalized_title text,
  tmdb_id integer,
  imdb_id text,
  created_at timestamptz not null default now(),
  unique (source_id, telegram_message_id)
);
create index if not exists media_imdb_id_idx on media(imdb_id);
create index if not exists media_title_search_idx on media using gin (to_tsvector('simple', coalesce(normalized_title, '') || ' ' || coalesce(file_name, '')));

create table if not exists link_bots (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  enabled boolean not null default true,
  url_pattern text,
  priority integer not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references media(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'complete', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists generation_jobs_queue_idx on generation_jobs(status, created_at);

create table if not exists direct_links (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references media(id) on delete cascade,
  link_bot_id uuid references link_bots(id) on delete set null,
  url text not null,
  created_at timestamptz not null default now(),
  unique (media_id, link_bot_id, url)
);
create index if not exists direct_links_live_idx on direct_links(media_id, created_at desc);

-- Service-role keys are server-only. Do not expose these tables through anon clients.
alter table worker_sessions enable row level security;
alter table source_channels enable row level security;
alter table media enable row level security;
alter table link_bots enable row level security;
alter table generation_jobs enable row level security;
alter table direct_links enable row level security;
