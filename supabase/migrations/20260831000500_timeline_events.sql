-- Context MVP: episodic timeline entries for recall and doing-now capture.
-- Run this once in Supabase SQL Editor.

create table if not exists timeline_events (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  profile_id    uuid references profiles(id) on delete set null,
  text          text not null,
  type          text not null check (type in ('plan', 'doing_now', 'did', 'completion', 'sms_reply')),
  source        text not null check (source in ('user-stated', 'sms', 'plan', 'system')),
  confidence    text not null check (confidence in ('high', 'low')),
  created_at    timestamptz not null default now()
);

create index if not exists timeline_events_household_created
  on timeline_events (household_id, created_at desc);

create index if not exists timeline_events_profile_created
  on timeline_events (profile_id, created_at desc);

alter table timeline_events enable row level security;

drop policy if exists "household timeline events" on timeline_events;

create policy "household timeline events"
  on timeline_events for all
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

grant all on timeline_events to authenticated;
grant all on timeline_events to service_role;
