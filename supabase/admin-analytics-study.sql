-- Study monitoring analytics support

create table if not exists study_outcomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  role text check (role in ('mci', 'cp')),
  session text check (session in ('pre', 'post')),
  measure_key text not null,
  score integer check (score between 1 and 5),
  recorded_at timestamp with time zone default now()
);

create unique index if not exists study_outcomes_unique_measure
  on study_outcomes (household_id, profile_id, role, session, measure_key);

create index if not exists study_outcomes_household
  on study_outcomes (household_id, role, measure_key);

alter table study_outcomes enable row level security;

drop policy if exists "household study outcomes" on study_outcomes;
create policy "household study outcomes"
  on study_outcomes for all
  using (
    exists (
      select 1 from profiles p
      where p.user_id = auth.uid()
        and p.household_id = study_outcomes.household_id
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.user_id = auth.uid()
        and p.household_id = study_outcomes.household_id
    )
  );

grant all on study_outcomes to authenticated;
grant all on study_outcomes to service_role;

alter table sms_messages
  add column if not exists reminder_log_id uuid references reminder_logs(id) on delete set null;

create index if not exists sms_messages_reminder_log
  on sms_messages (reminder_log_id);

alter table planned_activities
  drop constraint if exists planned_activities_status_check;

alter table planned_activities
  add constraint planned_activities_status_check
  check (status in ('planned', 'confirmed', 'not_now', 'skipped', 'abandoned'));

create or replace function abandon_past_planned_activities()
returns integer
language plpgsql
security definer
as $$
declare
  updated_count integer;
begin
  update planned_activities
  set status = 'abandoned',
      updated_at = now()
  where status in ('planned', 'not_now')
    and planned_for < current_date;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function abandon_past_planned_activities() to service_role;
