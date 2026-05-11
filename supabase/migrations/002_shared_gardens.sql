-- ============================================================
-- GrowLog AI — Shared Gardens Schema
-- Migration 002: Multi-user garden membership
-- ============================================================


-- ============================================================
-- 1. PROFILES
-- ============================================================
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  updated_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "users can view any profile"
  on profiles for select using (true);

create policy "users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Auto-create profile on new user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();


-- ============================================================
-- 2. GARDEN_MEMBERS
-- ============================================================
create table if not exists garden_members (
  id          uuid primary key default uuid_generate_v4(),
  garden_id   uuid not null references gardens(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'edit', 'view')),
  joined_at   timestamptz not null default now(),
  unique (garden_id, user_id)
);

create index if not exists garden_members_garden_id_idx on garden_members(garden_id);
create index if not exists garden_members_user_id_idx on garden_members(user_id);

alter table garden_members enable row level security;

-- Security-definer function avoids self-referential RLS recursion.
-- Claude chose this approach because: a policy on garden_members that queries
-- garden_members triggers infinite recursion in PostgreSQL and returns empty results.
-- Running the check inside a security definer function bypasses RLS for the inner
-- query only, breaking the cycle while still enforcing the same access rule.
create or replace function user_is_garden_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from garden_members
    where garden_id = gid and user_id = auth.uid()
  );
$$;

-- Anyone can see members of gardens they belong to
create policy "members can view garden members"
  on garden_members for select using (
    user_is_garden_member(garden_id)
  );

-- Only owners can add members
create policy "owners can insert garden members"
  on garden_members for insert with check (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_members.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Only owners can update roles
create policy "owners can update garden members"
  on garden_members for update using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_members.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Only owners can remove members (or members can remove themselves)
create policy "owners or self can delete garden members"
  on garden_members for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_members.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );


-- ============================================================
-- 3. GARDEN_INVITES
-- ============================================================
create table if not exists garden_invites (
  id            uuid primary key default uuid_generate_v4(),
  garden_id     uuid not null references gardens(id) on delete cascade,
  invited_by    uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  role          text not null check (role in ('edit', 'view')),
  token         uuid not null default uuid_generate_v4(),
  accepted_at   timestamptz,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  created_at    timestamptz not null default now(),
  unique (garden_id, email)
);

create index if not exists garden_invites_token_idx on garden_invites(token);
create index if not exists garden_invites_email_idx on garden_invites(email);

alter table garden_invites enable row level security;

-- Garden owners can see invites for their gardens
create policy "owners can view invites"
  on garden_invites for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_invites.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Garden owners can create invites
create policy "owners can create invites"
  on garden_invites for insert with check (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_invites.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Garden owners can delete/cancel invites
create policy "owners can delete invites"
  on garden_invites for delete using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = garden_invites.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

-- Invited users can see pending invites addressed to their own email
-- (needed for the dashboard invite banner)
create policy "invited users can view own pending invites"
  on garden_invites for select using (
    email = (select email from auth.users where id = auth.uid())
  );


-- ============================================================
-- 4. USER_TOOLTIP_PROGRESS
-- ============================================================
create table if not exists user_tooltip_progress (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  dismissed     text[] not null default '{}',   -- array of tooltip IDs that have been dismissed
  first_seen_at timestamptz not null default now()
);

alter table user_tooltip_progress enable row level security;

create policy "users can manage own tooltip progress"
  on user_tooltip_progress for all using (auth.uid() = user_id);


-- ============================================================
-- 5. BACKFILL: existing garden owners → garden_members
--    and existing users → profiles
-- ============================================================

-- Every garden that already exists gets its user_id owner as an 'owner' member
insert into garden_members (garden_id, user_id, role)
select id, user_id, 'owner'
from gardens
on conflict (garden_id, user_id) do nothing;

-- Every existing auth user gets a profiles row
insert into profiles (id, display_name, avatar_url)
select
  id,
  coalesce(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(email, '@', 1)
  ),
  raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;


-- ============================================================
-- 6. UPDATE RLS POLICIES ON EXISTING TABLES
-- ============================================================

-- ------------------------------------------------------------
-- gardens
-- ------------------------------------------------------------
drop policy if exists "users can view own gardens" on gardens;
drop policy if exists "users can insert own gardens" on gardens;
drop policy if exists "users can update own gardens" on gardens;
drop policy if exists "users can delete own gardens" on gardens;

create policy "garden members can view gardens"
  on gardens for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = gardens.id
        and gm.user_id = auth.uid()
    )
  );

-- Claude chose this approach because: the PRD requires the API to insert the owner
-- row into garden_members immediately after creating a garden, so the policy can't
-- gate inserts on membership (the row doesn't exist yet at insert time).
create policy "any user can insert garden"
  on gardens for insert with check (true);

create policy "owners can update gardens"
  on gardens for update using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = gardens.id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );

create policy "owners can delete gardens"
  on gardens for delete using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = gardens.id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );


-- ------------------------------------------------------------
-- crops — rename user_id → created_by, replace policies
-- ------------------------------------------------------------
drop policy if exists "users can view own crops" on crops;
drop policy if exists "users can insert own crops" on crops;
drop policy if exists "users can update own crops" on crops;
drop policy if exists "users can delete own crops" on crops;

alter table crops rename column user_id to created_by;

create policy "garden members can view crops"
  on crops for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = crops.garden_id
        and gm.user_id = auth.uid()
    )
  );

create policy "edit members can insert crops"
  on crops for insert with check (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = crops.garden_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );

create policy "edit members can update crops"
  on crops for update using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = crops.garden_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );

-- Owner can delete any crop; edit members can only delete their own
create policy "owners or creators can delete crops"
  on crops for delete using (
    auth.uid() = created_by
    or exists (
      select 1 from garden_members gm
      where gm.garden_id = crops.garden_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );


-- ------------------------------------------------------------
-- conversations — rename user_id → created_by, replace policies
-- ------------------------------------------------------------
drop policy if exists "users can view own conversations" on conversations;
drop policy if exists "users can insert own conversations" on conversations;
drop policy if exists "users can delete own conversations" on conversations;

alter table conversations rename column user_id to created_by;

create policy "garden members can view conversations"
  on conversations for select using (
    exists (
      select 1 from crops c
      join garden_members gm on gm.garden_id = c.garden_id
      where c.id = conversations.crop_id
        and gm.user_id = auth.uid()
    )
  );

create policy "edit members can insert conversations"
  on conversations for insert with check (
    exists (
      select 1 from crops c
      join garden_members gm on gm.garden_id = c.garden_id
      where c.id = conversations.crop_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );

create policy "owners or creators can delete conversations"
  on conversations for delete using (
    auth.uid() = created_by
    or exists (
      select 1 from crops c
      join garden_members gm on gm.garden_id = c.garden_id
      where c.id = conversations.crop_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );


-- ------------------------------------------------------------
-- session_logs — rename user_id → created_by, replace policies
-- ------------------------------------------------------------
drop policy if exists "users can view own session logs" on session_logs;
drop policy if exists "users can insert own session logs" on session_logs;
drop policy if exists "users can update own session logs" on session_logs;

alter table session_logs rename column user_id to created_by;

create policy "garden members can view session logs"
  on session_logs for select using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = session_logs.garden_id
        and gm.user_id = auth.uid()
    )
  );

create policy "edit members can insert session logs"
  on session_logs for insert with check (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = session_logs.garden_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );

create policy "edit members can update session logs"
  on session_logs for update using (
    exists (
      select 1 from garden_members gm
      where gm.garden_id = session_logs.garden_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'edit')
    )
  );
