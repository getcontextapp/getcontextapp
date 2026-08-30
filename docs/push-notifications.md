# Context Web Push — Batches A–C

Batch A provides authenticated, per-device Web Push subscriptions and a calm Updates history for Context households.

## Production setup

1. Apply `supabase/push-notifications.sql` in the production Supabase project.
2. Generate one VAPID key pair. Keep the private key secret.
3. Add these Vercel environment variables for Production:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (use `mailto:getcontextapp@gmail.com`)
4. Redeploy after the environment variables are saved.

Do not rotate the VAPID key pair casually. Existing browser subscriptions are associated with the public key and may need to be enabled again after rotation.

## Cohort rollout

The dashboard keeps these three households labeled **Internal Preview**:

- My Home
- The Odu Household
- Baru Home

All other households are labeled **Participant Pilot**. Batches A–C are available to both cohorts, including newly created households.

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
## Batch B exact-time delivery

- Plans with a specific `expected_time` are checked every five minutes in the recipient's timezone.
- A due reminder is sent once per plan and recipient, using the assigned profile when present.
- Push and SMS are independently controlled in Updates; exact-time reminders have their own toggle.
- Lock-screen task details remain hidden unless the profile explicitly enables them.
- The rollout is available to Internal Preview and Participant Pilot households.

## Batch C ContextRank check-ins

- The existing noon and 4 PM local reminder touchpoints use ContextRank for MCI profiles in both cohorts.
- ContextRank ranks today’s evidence for the `what_should_i_do_next` intent. Delivery then selects one currently planned, untimed task that belongs to the recipient.
- Exact-time tasks are excluded because Batch B already handles them at their due time.
- Tasks marked done, deferred with **Later**, assigned to someone else, or already suggested that day are excluded.
- A profile can receive at most two personalized check-ins per day, with at least four hours between them.
- A personalized check-in is skipped when an exact-time reminder was sent in the previous 45 minutes.
- ContextRank may abstain. When it does, Context sends nothing rather than inventing a suggestion.
- Short SMS replies are bound to the exact task in the latest ContextRank check-in: **yes** keeps it as the suggested next step, **later/no** defers it, and **done** completes it.
- Lock-screen detail remains private unless the profile enables it. The signed-in Recent updates history retains the selected task name.
- Push and SMS follow the profile’s existing delivery toggles. **Personalized check-ins** have a separate on/off control.
- If ContextRank abstains or cannot find an eligible untimed task, the existing pending-plan SMS remains the fallback so the scheduled check-in is not silently lost.

## NudgeRank calendar channel coordination

- A calendar event copied into Context remains visible for orientation, retrieval, and planning.
- NudgeRank suppresses ordinary Context push and SMS nudges for that event because the source calendar may already notify the participant.
- Context may notify only when the message adds distinct cognitive value beyond repeating the calendar alert, such as preparation guidance, recovery after a missed event, or a context-aware next step.
- The current alpha implementation does not claim distinct cognitive value for copied calendar events, so both exact-time reminders and scheduled pending-plan nudges exclude them by default.
- Forced QA calls can target one profile, preventing a test from messaging the broader pilot cohort.
