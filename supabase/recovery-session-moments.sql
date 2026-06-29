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
  updated_at     timestamptz not null default now(),
  unique (user_id, session_date, moment_key)
);

create index if not exists recovery_session_moments_user_date
  on recovery_session_moments (user_id, session_date);

create index if not exists recovery_session_moments_session
  on recovery_session_moments (session_id);
