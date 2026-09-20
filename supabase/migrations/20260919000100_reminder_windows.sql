alter table planned_activities
  add column if not exists reminder_window_start text,
  add column if not exists reminder_window_end text,
  add column if not exists preparation_minutes integer not null default 0;

alter table planned_activities
  drop constraint if exists planned_activities_preparation_minutes_check;

alter table planned_activities
  add constraint planned_activities_preparation_minutes_check
  check (preparation_minutes between 0 and 1440);
