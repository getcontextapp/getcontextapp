-- Daily Reflection episodic memory table.
-- Run once in Supabase SQL Editor.

create table if not exists reflections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  household_id    uuid not null references households(id) on delete cascade,
  raw_input       text not null,
  ai_summary      text not null,
  nodes           jsonb not null default '{"activities":[],"people":[],"places":[],"feelings":[]}'::jsonb,
  source          text not null default 'app' check (source in ('app', 'sms')),
  reflection_date date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reflections_one_per_user_day unique (user_id, reflection_date)
);

create index if not exists reflections_household_date
  on reflections (household_id, reflection_date desc);

alter table reflections enable row level security;

drop policy if exists "household reflections" on reflections;
drop policy if exists "insert own reflections" on reflections;
drop policy if exists "update own reflections" on reflections;

create policy "household reflections"
  on reflections for select
  using (
    household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

create policy "insert own reflections"
  on reflections for insert
  with check (
    user_id = auth.uid()
    and household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  );

create policy "update own reflections"
  on reflections for update
  using (
    user_id = auth.uid()
    and household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  );

grant select, insert, update on reflections to authenticated;
grant all on reflections to service_role;
