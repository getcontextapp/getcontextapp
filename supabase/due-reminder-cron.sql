-- Batch B: check exact-time plans every five minutes.
-- Uses the existing Context app URL and cron secret already stored in Supabase Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select cron.unschedule(jobid)
from cron.job
where jobname = 'context-due-reminders';

select cron.schedule(
  'context-due-reminders',
  '*/5 * * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'context_app_url')
        || '/api/reminders/due',
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
where jobname = 'context-due-reminders';
