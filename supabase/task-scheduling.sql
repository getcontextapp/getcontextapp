-- Context task scheduling: exact time, recurrence, and carry-over lineage.

alter table planned_activities
  add column if not exists repeat_rule text not null default 'none'
    check (repeat_rule in ('none', 'daily', 'weekdays', 'weekly')),
  add column if not exists series_id uuid,
  add column if not exists moved_from_id uuid references planned_activities(id) on delete set null;

create index if not exists planned_activities_series
  on planned_activities (series_id, planned_for);

create unique index if not exists planned_activities_one_series_occurrence
  on planned_activities (series_id, planned_for)
  where series_id is not null;

update planned_activities
set series_id = id
where repeat_rule <> 'none' and series_id is null;
