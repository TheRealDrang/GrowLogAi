-- ============================================================
-- GrowLog AI — Initial Schema
-- Run this in Supabase SQL Editor: your project → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- GARDENS
-- ============================================================
create table if not exists gardens (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  location    text,
  usda_zone   text,
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  sheet_url       text,   -- user's Apps Script web app URL for logging
  google_sheet_id     text,   -- Google Sheets file ID created automatically on garden setup
  weather_logged_date date,   -- tracks last date weather was logged to avoid duplicate daily entries
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists gardens_user_id_idx on gardens(user_id);

alter table gardens enable row level security;

create policy "users can view own gardens"
  on gardens for select using (auth.uid() = user_id);

create policy "users can insert own gardens"
  on gardens for insert with check (auth.uid() = user_id);

create policy "users can update own gardens"
  on gardens for update using (auth.uid() = user_id);

create policy "users can delete own gardens"
  on gardens for delete using (auth.uid() = user_id);

-- ============================================================
-- CROPS
-- ============================================================
create table if not exists crops (
  id            uuid primary key default uuid_generate_v4(),
  garden_id     uuid not null references gardens(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  variety       text,
  bed_location  text,
  sow_date      date,
  harvest_date  date,
  status        text not null default 'growing',  -- growing | harvested | failed
  notes         text,   -- also stores conversation summary when history > 20 turns
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists crops_garden_id_idx on crops(garden_id);
create index if not exists crops_user_id_idx on crops(user_id);

alter table crops enable row level security;

create policy "users can view own crops"
  on crops for select using (auth.uid() = user_id);

create policy "users can insert own crops"
  on crops for insert with check (auth.uid() = user_id);

create policy "users can update own crops"
  on crops for update using (auth.uid() = user_id);

create policy "users can delete own crops"
  on crops for delete using (auth.uid() = user_id);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
create table if not exists conversations (
  id         uuid primary key default uuid_generate_v4(),
  crop_id    uuid not null references crops(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists conversations_crop_id_idx on conversations(crop_id);
create index if not exists conversations_user_id_idx on conversations(user_id);
create index if not exists conversations_created_at_idx on conversations(created_at);

alter table conversations enable row level security;

create policy "users can view own conversations"
  on conversations for select using (auth.uid() = user_id);

create policy "users can insert own conversations"
  on conversations for insert with check (auth.uid() = user_id);

create policy "users can delete own conversations"
  on conversations for delete using (auth.uid() = user_id);

-- ============================================================
-- SESSION LOGS
-- ============================================================
create table if not exists session_logs (
  id              uuid primary key default uuid_generate_v4(),
  crop_id         uuid not null references crops(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  garden_id       uuid not null references gardens(id) on delete cascade,
  log_date        date not null default current_date,
  crop_name       text,
  garden_name     text,
  observation     text,
  action_taken    text,
  ai_advice       text,
  weather_summary text,
  sheet_posted    boolean not null default false,
  raw_json        jsonb,
  full_response   text,
  created_at      timestamptz not null default now()
);

create index if not exists session_logs_crop_id_idx on session_logs(crop_id);
create index if not exists session_logs_user_id_idx on session_logs(user_id);
create index if not exists session_logs_sheet_posted_idx on session_logs(sheet_posted);

alter table session_logs enable row level security;

create policy "users can view own session logs"
  on session_logs for select using (auth.uid() = user_id);

create policy "users can insert own session logs"
  on session_logs for insert with check (auth.uid() = user_id);

create policy "users can update own session logs"
  on session_logs for update using (auth.uid() = user_id);

-- ============================================================
-- updated_at trigger helper
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gardens_updated_at
  before update on gardens
  for each row execute function update_updated_at();

create trigger crops_updated_at
  before update on crops
  for each row execute function update_updated_at();

-- ============================================================
-- USER GOOGLE TOKENS
-- ============================================================
create table if not exists user_google_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table user_google_tokens enable row level security;

create policy "users can view own google token"
  on user_google_tokens for select using (auth.uid() = user_id);

create policy "users can insert own google token"
  on user_google_tokens for insert with check (auth.uid() = user_id);

create policy "users can update own google token"
  on user_google_tokens for update using (auth.uid() = user_id);

create trigger user_google_tokens_updated_at
  before update on user_google_tokens
  for each row execute function update_updated_at();
