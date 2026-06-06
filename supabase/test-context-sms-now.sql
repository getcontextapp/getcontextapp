-- Context MVP: send an immediate scheduler test to every SMS-ready MCI profile.
-- Run after setup-context-sms-cron.sql.
-- The protected route ignores the normal 8 AM window only for this test call.

select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'context_app_url')
    || '/api/sms/morning-plan?force=1',
  headers := jsonb_build_object(
    'Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'context_cron_secret')
  ),
  timeout_milliseconds := 30000
) as request_id;
