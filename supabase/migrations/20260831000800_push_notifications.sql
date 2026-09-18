-- Context Web Push foundation.
-- Apply once in Supabase before enabling the production UI.

create extension if not exists pgcrypto;
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  expiration_time bigint,
  user_agent text,
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx
  on push_subscriptions(profile_id, enabled);
create table if not exists notification_preferences (
  profile_id uuid primary key references profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  push_enabled boolean not null default false,
  sms_enabled boolean not null default true,
  detailed_content boolean not null default false,
  quiet_start time not null default '20:00',
  quiet_end time not null default '08:00',
  categories jsonb not null default '{"morning":true,"due":true,"reentry":true,"summary":true,"calendar":true,"care_partner":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  category text not null check (category in ('test', 'morning', 'due', 'reentry', 'summary', 'calendar', 'care_partner', 'admin')),
  title text not null,
  body text not null,
  url text not null default '/',
  dedupe_key text unique,
  channels jsonb not null default '[]'::jsonb,
  delivery_status jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notification_events_profile_created_idx
  on notification_events(profile_id, created_at desc);
alter table push_subscriptions enable row level security;
alter table notification_preferences enable row level security;
alter table notification_events enable row level security;
drop policy if exists "Profiles manage own push subscriptions" on push_subscriptions;
create policy "Profiles manage own push subscriptions"
  on push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "Profiles manage own notification preferences" on notification_preferences;
create policy "Profiles manage own notification preferences"
  on notification_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "Profiles view own notification events" on notification_events;
create policy "Profiles view own notification events"
  on notification_events for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Profiles mark own notification events read" on notification_events;
create policy "Profiles mark own notification events read"
  on notification_events for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, update, delete on push_subscriptions to authenticated;
grant select, insert, update on notification_preferences to authenticated;
grant select, update on notification_events to authenticated;
grant all on push_subscriptions, notification_preferences, notification_events to service_role;
