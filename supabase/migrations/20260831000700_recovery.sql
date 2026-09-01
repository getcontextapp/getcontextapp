-- Migration: create recovery_sessions and recovery_session_moments tables
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/vwlbcikwbjgqxyklqgcs/sql/new

-- 1. recovery_sessions
create table if not exists recovery_sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  household_id         uuid not null references households(id) on delete cascade,
  profile_id           uuid not null references profiles(id) on delete cascade,
  session_date         date not null,
  started_at           timestamptz not null default now(),
  completed_at         timestamptz,
  last_confirmed_text  text,
  last_confirmed_at    timestamptz,
  status               text not null default 'active'
                       check (status in ('active', 'completed', 'abandoned')),
  created_at           timestamptz not null default now()
);

create index if not exists recovery_sessions_user_date
  on recovery_sessions (user_id, session_date);

alter table recovery_sessions enable row level security;

drop policy if exists "users own recovery sessions" on recovery_sessions;
create policy "users own recovery sessions"
  on recovery_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2. recovery_session_moments
create table if not exists recovery_session_moments (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references recovery_sessions(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  household_id   uuid not null references households(id) on delete cascade,
  profile_id     uuid not null references profiles(id) on delete cascade,
  session_date   date not null,
  moment_key     text not null,
  answer_text    text,
  confidence     text,
  status         text not null default 'shown'
                 check (status in ('shown', 'confirmed', 'rejected', 'skipped')),
  shown_at       timestamptz not null default now(),
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table recovery_session_moments
  drop constraint if exists recovery_session_moments_user_id_session_date_moment_key_key;

create unique index if not exists recovery_session_moments_session_moment_key
  on recovery_session_moments (session_id, moment_key);

create index if not exists recovery_session_moments_user_date
  on recovery_session_moments (user_id, session_date);

create index if not exists recovery_session_moments_session
  on recovery_session_moments (session_id);

alter table recovery_session_moments enable row level security;

drop policy if exists "users own recovery session moments" on recovery_session_moments;
create policy "users own recovery session moments"
  on recovery_session_moments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. Verify
select 'recovery_sessions' as tbl, count(*) from recovery_sessions
union all
select 'recovery_session_moments', count(*) from recovery_session_moments;
