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
