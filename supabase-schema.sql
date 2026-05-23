-- ─────────────────────────────────────────────────────────────────────────────
-- Context App — Supabase Schema
-- Run in the Supabase SQL Editor for the getcontextapp project
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable uuid extension
create extension if not exists "pgcrypto";

-- ─── Households ──────────────────────────────────────────────────────────────
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   char(6) not null unique default upper(substring(md5(random()::text), 1, 6)),
  created_at  timestamptz default now()
);

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade unique,
  role                   text not null check (role in ('mci_user', 'care_partner')),
  display_name           text not null,
  phone_e164             text,
  household_id           uuid references households(id) on delete set null,
  reminder_gap_minutes   integer not null default 90,
  daily_summary_time     text not null default '20:00',
  timezone               text not null default 'America/New_York',
  created_at             timestamptz default now()
);

-- ─── Activity Logs ───────────────────────────────────────────────────────────
create table if not exists activity_logs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  logged_by     uuid not null references profiles(id) on delete cascade,
  category      text not null,
  label         text not null,
  note          text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz default now()
);

create index if not exists activity_logs_household_time
  on activity_logs (household_id, occurred_at desc);

-- ─── Context Cards ───────────────────────────────────────────────────────────
create table if not exists context_cards (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  activity_log_id  uuid references activity_logs(id) on delete set null,
  type             text not null check (type in ('open', 'reentry')),
  title            text not null,
  body             text not null,
  generated_by     text not null default 'ai',
  is_active        boolean not null default true,
  created_at       timestamptz default now()
);

create index if not exists context_cards_household_active
  on context_cards (household_id, is_active, created_at desc);

-- ─── Reminder Logs ───────────────────────────────────────────────────────────
create table if not exists reminder_logs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  type          text not null check (type in ('reentry', 'daily_summary')),
  sent_at       timestamptz not null default now(),
  twilio_sid    text,
  status        text not null default 'sent'
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table profiles       enable row level security;
alter table households     enable row level security;
alter table activity_logs  enable row level security;
alter table context_cards  enable row level security;
alter table reminder_logs  enable row level security;

-- Profiles: user sees own profile
create policy "own profile"
  on profiles for all
  using (auth.uid() = user_id);

-- Households: members see their household
create policy "household member"
  on households for all
  using (
    id in (
      select household_id from profiles where user_id = auth.uid()
    )
  );

-- Activity logs: household members
create policy "household activity"
  on activity_logs for all
  using (
    household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  );

-- Context cards: household members
create policy "household cards"
  on context_cards for all
  using (
    household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  );

-- Reminder logs: household members (read only for non-service)
create policy "household reminders read"
  on reminder_logs for select
  using (
    household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
  );

-- ─── Helper function: get profile for current user ────────────────────────────
create or replace function get_my_profile()
returns profiles language sql stable security definer as $$
  select * from profiles where user_id = auth.uid() limit 1;
$$;
