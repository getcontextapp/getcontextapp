-- Context MVP: SMS message log for Twilio inbound/outbound workflow
-- Run once in Supabase SQL Editor.

create table if not exists sms_messages (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references households(id) on delete set null,
  profile_id    uuid references profiles(id) on delete set null,
  direction     text not null check (direction in ('inbound', 'outbound')),
  purpose       text not null,
  phone_e164    text not null,
  body          text not null,
  twilio_sid    text,
  reminder_log_id uuid,
  status        text not null default 'recorded',
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists sms_messages_profile_time
  on sms_messages (profile_id, created_at desc);

create index if not exists sms_messages_household_time
  on sms_messages (household_id, created_at desc);

create index if not exists sms_messages_reminder_log
  on sms_messages (reminder_log_id);

alter table sms_messages enable row level security;

drop policy if exists "household sms messages" on sms_messages;

create policy "household sms messages"
  on sms_messages for select
  using (
    household_id in (
      select household_id from profiles where user_id = auth.uid()
    )
    or profile_id in (
      select id from profiles where user_id = auth.uid()
    )
  );

grant select on sms_messages to authenticated;
grant all on sms_messages to service_role;
