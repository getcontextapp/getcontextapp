-- Repair production analytics dependencies. This migration is intentionally additive.

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  text text not null,
  type text not null check (type in ('plan', 'doing_now', 'did', 'completion', 'sms_reply')),
  source text not null check (source in ('user-stated', 'sms', 'plan', 'system')),
  confidence text not null check (confidence in ('high', 'low')),
  created_at timestamptz not null default now()
);

create index if not exists timeline_events_household_created
  on public.timeline_events (household_id, created_at desc);
create index if not exists timeline_events_profile_created
  on public.timeline_events (profile_id, created_at desc);
alter table public.timeline_events enable row level security;
drop policy if exists "household timeline events" on public.timeline_events;
create policy "household timeline events" on public.timeline_events for all
  using (household_id in (select household_id from public.profiles where user_id = auth.uid()))
  with check (household_id in (select household_id from public.profiles where user_id = auth.uid()));
grant all on public.timeline_events to authenticated, service_role;

-- The recovery tables existed in migration history but lacked explicit grants in production.
grant all on public.recovery_sessions to authenticated, service_role;
grant all on public.recovery_session_moments to authenticated, service_role;

-- The app and analytics both rely on hiding individual synced calendar events.
alter table public.calendar_events add column if not exists hidden_at timestamptz;
grant select on public.calendar_events to authenticated;
grant all on public.calendar_events to service_role;

-- Make analytics indexes cover the time-window queries used by the dashboard.
create index if not exists analytics_events_created_id_idx
  on public.analytics_events (created_at, id);
create index if not exists sms_messages_created_id_idx
  on public.sms_messages (created_at, id);
create index if not exists notification_events_created_id_idx
  on public.notification_events (created_at, id);

notify pgrst, 'reload schema';
