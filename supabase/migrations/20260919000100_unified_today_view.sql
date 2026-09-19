-- Unified Today view data model. Appointments stay external/read-only;
-- Context stores only local marks and optional task links.
alter table public.planned_activities
  add column if not exists provider text,
  add column if not exists external_event_id uuid references public.calendar_events(id) on delete set null,
  add column if not exists sync_direction text not null default 'read' check (sync_direction in ('read', 'read_write')),
  add column if not exists link_decision text check (link_decision in ('linked', 'separate')),
  add column if not exists mark_state text check (mark_state in ('done', 'attended', 'deferred')),
  add column if not exists marked_at timestamptz,
  add column if not exists reminder_owner text check (reminder_owner in ('context', 'external'));

create index if not exists planned_activities_external_event
  on public.planned_activities (external_event_id);

create table if not exists public.calendar_event_marks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  mark_state text not null check (mark_state in ('attended', 'deferred')),
  marked_at timestamptz not null default now(),
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_event_id, profile_id)
);

alter table public.calendar_event_marks enable row level security;
drop policy if exists "household calendar event marks" on public.calendar_event_marks;
create policy "household calendar event marks"
  on public.calendar_event_marks for all
  using (household_id in (select household_id from public.profiles where user_id = auth.uid()))
  with check (household_id in (select household_id from public.profiles where user_id = auth.uid()));

grant all on public.calendar_event_marks to authenticated;
grant all on public.calendar_event_marks to service_role;
