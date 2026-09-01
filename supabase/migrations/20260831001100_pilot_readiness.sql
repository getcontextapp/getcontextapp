-- Context MVP pilot readiness support.
-- Run this once in Supabase before participant rollout.

create table if not exists study_outcomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role text not null check (role in ('mci', 'cp')),
  session text not null check (session in ('pre', 'post')),
  measure_key text not null,
  score integer check (score between 1 and 5),
  recorded_at timestamp with time zone default now()
);

create unique index if not exists study_outcomes_unique_measure
  on study_outcomes (household_id, profile_id, role, session, measure_key);

create index if not exists study_outcomes_household_idx
  on study_outcomes (household_id, role, measure_key);

alter table study_outcomes enable row level security;

drop policy if exists "Members can view household study outcomes" on study_outcomes;
create policy "Members can view household study outcomes"
  on study_outcomes
  for select
  using (
    exists (
      select 1
      from profiles p
      where p.user_id = auth.uid()
        and p.household_id = study_outcomes.household_id
    )
  );

drop policy if exists "Service role can manage study outcomes" on study_outcomes;
create policy "Service role can manage study outcomes"
  on study_outcomes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on study_outcomes to authenticated;
grant all on study_outcomes to service_role;

create table if not exists household_feature_flags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, feature_key)
);

create index if not exists household_feature_flags_household_idx
  on household_feature_flags (household_id, feature_key);

alter table household_feature_flags enable row level security;

drop policy if exists "Members can view household feature flags" on household_feature_flags;
create policy "Members can view household feature flags"
  on household_feature_flags
  for select
  using (
    exists (
      select 1
      from profiles p
      where p.user_id = auth.uid()
        and p.household_id = household_feature_flags.household_id
    )
  );

drop policy if exists "Service role can manage household feature flags" on household_feature_flags;
create policy "Service role can manage household feature flags"
  on household_feature_flags
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on household_feature_flags to authenticated;
grant all on household_feature_flags to service_role;

insert into household_feature_flags (household_id, feature_key, enabled)
select h.id, feature.feature_key, true
from households h
cross join (values ('pilot_preview'), ('calendar_sync')) as feature(feature_key)
on conflict (household_id, feature_key)
do update set enabled = excluded.enabled, updated_at = now();
