-- Allow signed-in household members to read profiles in their own household.
-- This lets a care partner see the linked MCI profile name/phone without exposing other households.

create or replace function public.current_user_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;

grant execute on function public.current_user_household_id() to authenticated;

drop policy if exists "household profiles read" on public.profiles;

create policy "household profiles read"
  on public.profiles
  for select
  using (
    household_id = public.current_user_household_id()
  );
