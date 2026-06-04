-- Context SMS inbound profile lookup
-- Run this in Supabase SQL Editor.
-- It lets the Twilio webhook safely find the matching Context profile by phone.

create table if not exists public.sms_messages (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references public.households(id) on delete set null,
  profile_id    uuid references public.profiles(id) on delete set null,
  direction     text not null check (direction in ('inbound', 'outbound')),
  purpose       text not null,
  phone_e164    text not null,
  body          text not null,
  twilio_sid    text,
  status        text not null default 'recorded',
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists sms_messages_profile_time
  on public.sms_messages (profile_id, created_at desc);

create index if not exists sms_messages_household_time
  on public.sms_messages (household_id, created_at desc);

alter table public.sms_messages enable row level security;

drop policy if exists "household sms messages" on public.sms_messages;

create policy "household sms messages"
  on public.sms_messages for select
  using (
    household_id in (
      select household_id from public.profiles where user_id = auth.uid()
    )
    or profile_id in (
      select id from public.profiles where user_id = auth.uid()
    )
  );

grant select on public.sms_messages to authenticated;
grant insert on public.sms_messages to authenticated;
grant all on public.sms_messages to service_role;

create or replace function public.find_sms_profile_by_phone(incoming_phone text)
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  with input_phone as (
    select right(regexp_replace(coalesce(incoming_phone, ''), '\D', '', 'g'), 10) as last10
  ),
  direct_profile as (
    select p.*
    from public.profiles p
    cross join input_phone i
    where p.phone_e164 is not null
      and p.household_id is not null
      and right(regexp_replace(p.phone_e164, '\D', '', 'g'), 10) = i.last10
    order by case when p.role = 'mci_user' then 0 else 1 end, p.created_at asc
    limit 1
  ),
  recent_sms_profile as (
    select p.*
    from public.sms_messages s
    join public.profiles p on p.id = s.profile_id
    cross join input_phone i
    where s.profile_id is not null
      and p.household_id is not null
      and right(regexp_replace(s.phone_e164, '\D', '', 'g'), 10) = i.last10
    order by s.created_at desc
    limit 1
  )
  select * from direct_profile
  union all
  select * from recent_sms_profile
  where not exists (select 1 from direct_profile)
  limit 1;
$$;

grant execute on function public.find_sms_profile_by_phone(text) to anon;
grant execute on function public.find_sms_profile_by_phone(text) to authenticated;
grant execute on function public.find_sms_profile_by_phone(text) to service_role;
