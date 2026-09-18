create table if not exists public.input_captures (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  raw_text text not null check (char_length(raw_text) between 1 and 20000),
  status text not null default 'captured' check (status in (
    'captured', 'interpreting', 'needs_confirmation', 'confirmed', 'failed', 'cancelled'
  )),
  interpretation jsonb not null default '{}'::jsonb,
  linked_planned_activity_ids uuid[] not null default '{}',
  timeline_event_id uuid references public.timeline_events(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists input_captures_profile_created_idx
  on public.input_captures(profile_id, created_at desc);
alter table public.input_captures enable row level security;
drop policy if exists "Participants can read their captures" on public.input_captures;
create policy "Participants can read their captures"
  on public.input_captures for select
  using (auth.uid() = user_id);
drop policy if exists "Participants can create their captures" on public.input_captures;
create policy "Participants can create their captures"
  on public.input_captures for insert
  with check (auth.uid() = user_id);
drop policy if exists "Participants can update their captures" on public.input_captures;
create policy "Participants can update their captures"
  on public.input_captures for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update on public.input_captures to authenticated;
grant all on public.input_captures to service_role;
