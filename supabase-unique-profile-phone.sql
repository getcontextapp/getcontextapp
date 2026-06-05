-- Context: make sure each phone number belongs to only one profile.
-- Run this once in Supabase SQL Editor.

update public.profiles
set phone_e164 = null
where btrim(coalesce(phone_e164, '')) = '';

update public.profiles
set phone_e164 = case
  when length(regexp_replace(phone_e164, '\D', '', 'g')) = 10
    then '+1' || regexp_replace(phone_e164, '\D', '', 'g')
  when length(regexp_replace(phone_e164, '\D', '', 'g')) = 11
    and left(regexp_replace(phone_e164, '\D', '', 'g'), 1) = '1'
    then '+' || regexp_replace(phone_e164, '\D', '', 'g')
  else phone_e164
end
where phone_e164 is not null;

-- If this returns rows, those phone numbers are already duplicated.
-- Clear or change one duplicate profile phone, then rerun this file.
select
  phone_e164,
  count(*) as profile_count,
  array_agg(display_name || ' (' || role || ')') as profiles
from public.profiles
where phone_e164 is not null
group by phone_e164
having count(*) > 1;

create unique index if not exists profiles_phone_e164_unique
  on public.profiles (phone_e164)
  where phone_e164 is not null;
