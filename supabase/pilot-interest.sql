-- Public landing page pilot interest form submissions

create table if not exists pilot_interest (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  role text not null check (role in ('person_with_memory_changes', 'care_partner', 'clinician')),
  source text not null default 'landing_home',
  user_agent text,
  created_at timestamp with time zone not null default now()
);

create index if not exists pilot_interest_created_at_idx
  on pilot_interest (created_at desc);

create index if not exists pilot_interest_email_idx
  on pilot_interest (lower(email));

alter table pilot_interest enable row level security;

grant all on pilot_interest to service_role;
