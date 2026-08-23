-- Context MVP: read-only Google Calendar sync.
-- Run this once in Supabase SQL Editor, then add Google OAuth env vars in Vercel.

create table if not exists household_feature_flags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, feature_key)
);

create index if not exists household_feature_flags_feature
  on household_feature_flags (feature_key, enabled);

alter table household_feature_flags enable row level security;

drop policy if exists "household feature flags visible to household" on household_feature_flags;
create policy "household feature flags visible to household"
  on household_feature_flags for select
  using (
    household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  );

grant select on household_feature_flags to authenticated;
grant all on household_feature_flags to service_role;

create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_profile_id uuid not null references profiles(id) on delete cascade,
  connected_by_profile_id uuid references profiles(id) on delete set null,
  provider text not null check (provider in ('google')),
  provider_account_email text,
  status text not null default 'active' check (status in ('active', 'revoked', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_profile_id, provider)
);

create index if not exists calendar_connections_household
  on calendar_connections (household_id, owner_profile_id, provider, status);

alter table calendar_connections enable row level security;

drop policy if exists "household calendar connections" on calendar_connections;
create policy "household calendar connections"
  on calendar_connections for all
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

grant select on calendar_connections to authenticated;
grant all on calendar_connections to service_role;

create table if not exists calendar_connection_tokens (
  connection_id uuid primary key references calendar_connections(id) on delete cascade,
  access_token text,
  refresh_token text,
  scope text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table calendar_connection_tokens enable row level security;
revoke all on calendar_connection_tokens from anon;
revoke all on calendar_connection_tokens from authenticated;
grant all on calendar_connection_tokens to service_role;

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_profile_id uuid not null references profiles(id) on delete cascade,
  connection_id uuid not null references calendar_connections(id) on delete cascade,
  provider text not null check (provider in ('google')),
  provider_event_id text not null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  hidden_at timestamptz,
  html_link text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_event_id)
);

alter table calendar_events
  add column if not exists hidden_at timestamptz;

create index if not exists calendar_events_owner_window
  on calendar_events (owner_profile_id, starts_at, status);

create index if not exists calendar_events_household_window
  on calendar_events (household_id, starts_at, status);

alter table calendar_events enable row level security;

drop policy if exists "household calendar events" on calendar_events;
create policy "household calendar events"
  on calendar_events for all
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

grant select on calendar_events to authenticated;
grant all on calendar_events to service_role;

-- Internal preview cohort for current non-participant households.
insert into household_feature_flags (household_id, feature_key, enabled)
select id, 'calendar_sync', true
from households
where lower(name) like '%bilau%'
   or lower(name) like '%baru%'
   or lower(name) like '%davis%'
on conflict (household_id, feature_key)
do update set enabled = excluded.enabled, updated_at = now();
