-- Context MVP: planned activities for SMS/manual confirmation
-- Run this once in Supabase SQL Editor.

create table if not exists planned_activities (
  id                         uuid primary key default gen_random_uuid(),
  household_id               uuid not null references households(id) on delete cascade,
  created_by                 uuid not null references profiles(id) on delete cascade,
  assigned_to                uuid references profiles(id) on delete set null,
  category                   text not null,
  label                      text not null,
  note                       text,
  expected_period            text not null default 'anytime'
                             check (expected_period in ('morning', 'afternoon', 'evening', 'anytime')),
  expected_time              text,
  repeat_rule                text not null default 'none'
                             check (repeat_rule in ('none', 'daily', 'weekdays', 'weekly')),
  series_id                  uuid,
  moved_from_id              uuid references planned_activities(id) on delete set null,
  planned_for                date not null default current_date,
  status                     text not null default 'planned'
                             check (status in ('planned', 'confirmed', 'not_now', 'skipped')),
  confirmed_activity_log_id  uuid references activity_logs(id) on delete set null,
  confirmed_at               timestamptz,
  source                     text not null default 'manual' check (source in ('manual', 'sms_ai')),
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now()
);

create index if not exists planned_activities_household_day
  on planned_activities (household_id, planned_for, status);

create index if not exists planned_activities_series
  on planned_activities (series_id, planned_for);

create unique index if not exists planned_activities_one_series_occurrence
  on planned_activities (series_id, planned_for)
  where series_id is not null;

alter table planned_activities enable row level security;

drop policy if exists "household planned activities" on planned_activities;

create policy "household planned activities"
  on planned_activities for all
  using (
    household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  )
  with check (
    household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  );

grant all on planned_activities to authenticated;
grant all on planned_activities to service_role;
