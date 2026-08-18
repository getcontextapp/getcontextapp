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

create schema if not exists study;

create table if not exists study.cohorts (
  id text primary key,
  label text not null,
  code_prefix text not null,
  started_on date,
  active boolean not null default false,
  created_at timestamp with time zone not null default now()
);

insert into study.cohorts (id, label, code_prefix, active)
values
  ('test', 'Internal testers', 'D', false),
  ('pilot-1', 'Pilot cohort', 'P', true)
on conflict (id) do update
set label = excluded.label,
    code_prefix = excluded.code_prefix,
    active = excluded.active;

alter table if exists study.dyads
  add column if not exists cohort text not null default 'test';

do $$
begin
  if to_regclass('study.dyads') is not null then
    update study.dyads
    set cohort = 'test'
    where cohort is null;
  end if;
end;
$$;

create table if not exists study.dyad_labels (
  dyad_id uuid primary key,
  label text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists study.interview_flag_thresholds (
  key text primary key,
  threshold integer not null,
  question text not null,
  source_label text not null,
  active boolean not null default true,
  updated_at timestamp with time zone not null default now()
);

insert into study.interview_flag_thresholds (key, threshold, question, source_label)
values
  ('no_context', 2, 'What were you looking for that Context did not have?', 'Query log'),
  ('rank_failure', 2, 'When it showed you a list, did you see what you needed?', 'Context Rank'),
  ('unresolved_after_result', 3, 'You looked something up and nothing happened. Walk me through one.', 'Recovery'),
  ('voice_abandoned', 4, 'How did speaking to it go?', 'Modality'),
  ('reflection_not_surfaced', 3, 'Did any of what you wrote come back to you later?', 'Modality'),
  ('low_sms_reply_rate', 30, 'Tell me about the morning texts.', 'SMS'),
  ('sms_undelivered', 1, 'Are the texts arriving at all?', 'SMS technical'),
  ('cp_extra_checking', 1, 'CP: what did Context add to your plate?', 'Care partner report'),
  ('many_unresolved_threads', 6, 'A lot gets started and left open. What happens?', 'Threads'),
  ('dark_days', 2, 'Check in. Is anything broken?', 'Persistence technical'),
  ('unanswered_event_prompts', 4, 'The app asked what you were doing and you skipped it.', 'Prompts'),
  ('no_attempts_by_day_four', 4, 'Did you know the Need Help Remembering button was there?', 'Recovery')
on conflict (key) do update
set threshold = excluded.threshold,
    question = excluded.question,
    source_label = excluded.source_label,
    updated_at = now();

create or replace view study.v_interview_flags as
select
  null::uuid as dyad_id,
  t.key,
  t.question,
  'Computed in the admin analytics loader until the study rollup job is materialized.'::text as evidence,
  t.source_label
from study.interview_flag_thresholds t
where t.active = true
  and false;

grant usage on schema study to authenticated, service_role;
grant select on study.cohorts to authenticated, service_role;
grant all on study.dyad_labels to authenticated, service_role;
grant select on study.interview_flag_thresholds to authenticated, service_role;
grant select on study.v_interview_flags to authenticated, service_role;
