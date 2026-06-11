-- Context MVP: reliable scheduled SMS through Supabase Cron.
-- Run once in the Supabase SQL Editor.
--
-- Before running:
-- 1. Replace PASTE_THE_EXISTING_VERCEL_CRON_SECRET below with the CRON_SECRET
--    value already configured in Vercel.
-- 2. Keep the secret private. Supabase Vault stores it encrypted.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select vault.create_secret(
  'https://getcontextapp.com',
  'context_app_url',
  'Context production app URL'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'context_app_url'
);

select vault.create_secret(
  'PASTE_THE_EXISTING_VERCEL_CRON_SECRET',
  'context_cron_secret',
  'Authorization secret for Context scheduled routes'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'context_cron_secret'
);

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'context-morning-plan',
  'context-morning-followup',
  'context-noon-reminder',
  'context-afternoon-reminder',
  'context-daily-summary',
  'context-weekly-summary'
);

-- Jobs run hourly and the Context route checks each profile's local timezone.
-- Staggered minutes keep the jobs from competing with one another.
select cron.schedule(
  'context-morning-plan',
  '0 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'context_app_url')
        || '/api/sms/morning-plan',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'context_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $$
);

select cron.schedule(
  'context-morning-followup',
  '2 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'context_app_url')
        || '/api/sms/morning-followup',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'context_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $$
);

select cron.schedule(
  'context-noon-reminder',
  '4 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'context_app_url')
        || '/api/reminders/noon',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'context_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $$
);

select cron.schedule(
  'context-afternoon-reminder',
  '6 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'context_app_url')
        || '/api/reminders/afternoon',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'context_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $$
);

select cron.schedule(
  'context-daily-summary',
  '8 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'context_app_url')
        || '/api/daily-summary',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'context_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $$
);

select jobid, jobname, schedule, active
from cron.job
where jobname like 'context-%'
order by jobname;
