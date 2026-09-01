-- Backfill the Solo/Shared onboarding preference without moving or deleting data.
-- Runtime status is still derived from linked members, so a care partner joining
-- changes the household to Shared automatically.

insert into household_feature_flags (household_id, feature_key, enabled)
select
  h.id,
  'solo_account',
  not exists (
    select 1
    from profiles p
    where p.household_id = h.id
      and p.role = 'care_partner'
  )
from households h
on conflict (household_id, feature_key)
do update set enabled = excluded.enabled, updated_at = now();

-- These two currently enrolled households were confirmed as Solo by the study team.
insert into household_feature_flags (household_id, feature_key, enabled)
select id, 'solo_account', true
from households
where lower(trim(name)) in ('the odu household', 'philip')
on conflict (household_id, feature_key)
do update set enabled = true, updated_at = now();
