-- ============================================================
-- GrowLog AI — Security: lock down profiles and digest_log
-- 1. profiles was readable by anyone holding the public anon key (including
--    logged-out visitors), exposing every display name and unsubscribe token.
-- 2. digest_log had row level security disabled, so anyone could read/edit it.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: does the current user share at least one garden with `other_user`?
-- ------------------------------------------------------------
-- Claude chose this approach because: garden_members RLS only lets a user see their
-- own membership rows, so a plain subquery inside a profiles policy could never find
-- co-members. SECURITY DEFINER lets this one narrow yes/no check see all memberships.
create or replace function public.shares_garden_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from garden_members mine
    join garden_members theirs on theirs.garden_id = mine.garden_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user
  );
$$;

revoke all on function public.shares_garden_with(uuid) from public, anon;
grant execute on function public.shares_garden_with(uuid) to authenticated;

-- ------------------------------------------------------------
-- profiles: only logged-in users, and only their own row or garden co-members
-- ------------------------------------------------------------
drop policy if exists "users can view any profile" on profiles;

create policy "users can view own and co-member profiles"
  on profiles for select to authenticated
  using (id = auth.uid() or public.shares_garden_with(id));

-- Claude chose this approach because: the unsubscribe token and digest setting are only
-- ever read server-side with the admin key, so browser-facing roles never need them.
-- Column-level grants hide them even from a user reading their own row.
revoke select on profiles from anon, authenticated;
grant select (id, display_name, avatar_url, updated_at) on profiles to authenticated;

-- ------------------------------------------------------------
-- garden_alerts: users may only change status fields, not the AI chat_context
-- ------------------------------------------------------------
-- Claude chose this approach because: chat_context is fed into the AI's system instructions,
-- so users must not be able to rewrite it; the app only ever updates status/acknowledged_at.
revoke update on garden_alerts from anon, authenticated;
grant update (status, acknowledged_at) on garden_alerts to authenticated;

-- ------------------------------------------------------------
-- digest_log: server-only table — enable RLS with no policies
-- ------------------------------------------------------------
-- With RLS on and no policies, anon/authenticated get nothing; the admin (service role)
-- key used by the daily cron bypasses RLS and keeps working.
alter table digest_log enable row level security;
