# Context Web Push — Batch A

Batch A provides authenticated, per-device Web Push subscriptions and a calm Updates history for Internal Preview households only.

## Production setup

1. Apply `supabase/push-notifications.sql` in the production Supabase project.
2. Generate one VAPID key pair. Keep the private key secret.
3. Add these Vercel environment variables for Production:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (use `mailto:getcontextapp@gmail.com`)
4. Redeploy after the environment variables are saved.

Do not rotate the VAPID key pair casually. Existing browser subscriptions are associated with the public key and may need to be enabled again after rotation.

## Internal Preview boundary

The UI and APIs check the exact household name through the shared cohort classifier. Batch A is available only to:

- My Home
- The Odu Household
- Baru Home

All other households receive `eligible: false` and cannot create a push subscription.

## iPhone test

1. Use iOS 16.4 or later.
2. Add Context to the Home Screen and open it from the Home Screen icon.
3. Open **Updates**.
4. Tap **Enable notifications** and approve the system permission.
5. Tap **Send me a test notification**.
6. Close or background Context and confirm the notification appears.
7. Tap the notification and confirm Context opens to the correct dashboard.
8. Return to Updates and confirm the notification appears in Recent updates.

## Android test

Open Context in a supported browser, enable notifications from Updates, send a test, background the app, and verify delivery and navigation.

## Privacy behavior

- Lock-screen detail is off by default.
- The Batch A test message contains no plan, health, calendar, or household details.
- Each user must grant permission on their own device.
- Turning notifications off disables only the current device when other active subscriptions exist.
- Expired push endpoints are disabled after the push service returns 404 or 410.
