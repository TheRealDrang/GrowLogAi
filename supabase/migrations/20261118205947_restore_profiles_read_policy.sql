-- Codex chose this approach because: both environments lost the intended SELECT
-- policy, so even the current user's profile is invisible and UPDATE returns no row.
-- Restore the migration 011 rule without reopening anonymous access or token columns.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'users can view own and co-member profiles'
  ) then
    create policy "users can view own and co-member profiles"
      on public.profiles for select to authenticated
      using (id = auth.uid() or public.shares_garden_with(id));
  end if;
end;
$$;
