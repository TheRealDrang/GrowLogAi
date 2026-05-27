-- garden_alerts table
create table if not exists garden_alerts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  garden_id       uuid references gardens(id) on delete cascade,
  crop_id         uuid references crops(id) on delete cascade,
  alert_type      text not null,
  priority        integer not null default 2,  -- 1=urgent, 2=normal, 3=low
  title           text not null,
  body            text not null,
  action_label    text,
  action_url      text,
  chat_context    text,
  status          text not null default 'active',  -- active|acknowledged|dismissed|expired
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);
create index garden_alerts_user_id_idx   on garden_alerts(user_id);
create index garden_alerts_status_idx    on garden_alerts(status);
create index garden_alerts_garden_id_idx on garden_alerts(garden_id);
create index garden_alerts_crop_id_idx   on garden_alerts(crop_id);
alter table garden_alerts enable row level security;
create policy "users can view own alerts"   on garden_alerts for select using (auth.uid() = user_id);
create policy "users can update own alerts" on garden_alerts for update using (auth.uid() = user_id);

-- digest_log table (deduplication guard — prevents sending more than one email per user per day)
create table if not exists digest_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  sent_at     timestamptz not null default now(),
  alert_count integer not null,
  email_id    text
);
create index digest_log_user_id_idx on digest_log(user_id);

-- Add digest opt-out to profiles
alter table profiles add column if not exists digest_enabled boolean not null default true;
