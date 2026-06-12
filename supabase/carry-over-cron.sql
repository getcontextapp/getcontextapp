-- Add the carry-over prompt without changing Context's other scheduled jobs.
-- This uses the existing app URL and cron secret stored in Supabase Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select cron.unschedule(jobid)
from cron.job
where jobname = 'context-carry-over';

select cron.schedule(
  'context-carry-over',
  '10 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'context_app_url')
        || '/api/reminders/carry-over',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'context_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $$
);
