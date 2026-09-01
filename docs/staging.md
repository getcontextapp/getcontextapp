# Lightweight staging

Staging is an isolated copy of Context for QA before participant-facing releases.

## Safety boundaries

- Use the dedicated Supabase staging project only.
- Set `CONTEXT_ENV=staging` and `STAGING_PROJECT_REF`.
- SMS is blocked unless the normalized recipient appears in `STAGING_SMS_ALLOWLIST`.
- Push is blocked unless the auth user ID appears in `STAGING_PUSH_USER_ALLOWLIST`.
- Do not configure cron jobs in staging. Run notification endpoints manually when testing.
- Production data and production deployment configuration are not copied into staging.

## Demo accounts

- `solo.demo@getcontextapp.com` — Solo participant
- `shared.demo@getcontextapp.com` — Shared participant
- `cp.demo@getcontextapp.com` — Care partner in the shared household

All three use the password in `STAGING_DEMO_PASSWORD`. The seed includes sample plans, completed activities, feature flags, and a sample calendar event.

## Seed or reset

Load only staging environment variables, then run:

```sh
npm run staging:seed
npm run staging:reset
```

Both commands refuse to run unless `CONTEXT_ENV=staging` and the Supabase URL contains `STAGING_PROJECT_REF`. `staging:seed` first removes any earlier demo data, then recreates a known state. Its output includes the three auth user IDs to copy into `STAGING_PUSH_USER_ALLOWLIST`.

Set `STAGING_TEST_PHONE` and the same number in `STAGING_SMS_ALLOWLIST` only when testing SMS. Leave Twilio credentials absent to disable staging SMS completely.

## Release flow

1. Deploy the candidate revision to `staging.getcontextapp.com`.
2. Reset the demo data.
3. QA Solo, Shared participant, and care-partner flows.
4. Manually test SMS/push only with allowlisted test identities.
5. Promote the same verified revision to production.
