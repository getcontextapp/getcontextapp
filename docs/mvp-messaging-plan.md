# Context MVP Messaging Plan

## MVP thesis

Context is not a diary app. The MVP should test whether gentle cues, simple confirmations, and care partner visibility help an older adult with MCI stay oriented during daily life.

## Sprint tracker

- [x] Get Twilio campaign approved and number registered.
- [x] Send outbound SMS from the Context number.
- [x] Configure inbound SMS webhook.
- [x] Let MCI participant confirm pending items by SMS.
- [x] Ask which item when multiple pending activities exist.
- [x] Gate inbound SMS by profile role so care partner numbers cannot run MCI-only actions.
- [x] Add unknown-number response with a Context link.
- [x] Add app-level phone normalization and duplicate-phone error handling.
- [ ] Run the phone-uniqueness SQL in Supabase production.
- [ ] Retest that a care partner number receives only care-partner-appropriate replies.
- [ ] Retest that an unknown number receives the generic Context reply.
- [x] Finish automatic scheduling for 8 AM prompt, no-response follow-up, pending reminders, and end-of-day summary.
- [x] Decide the free scheduler path for production.
- [x] Add fixed daily pending-task nudges for the Hobby plan.
- [x] Add undo/reopen support for mistakenly completed planned activities.
- [x] Change SMS undo to list completed tasks and let the MCI user choose one or more by number.
- [x] Add SMS analytics events for sent, received, parsed, confirmed, no-response, and opt-out.
- [x] Add 2-week pilot engagement analytics for MCI and care partner dashboard views, planned tasks, confirmations, undo/reopen actions, unclear SMS replies, reminders, and summaries.
- [x] Hide or remove MVP SMS flow test buttons before participant testing.
- [x] Add production checklist for phone uniqueness and pilot analytics exports.
- [ ] Confirm phone uniqueness enforcement in Supabase production before adding pilot users.

## Webapp changes now

- Keep the main activity tiles as the primary structure: Morning, Meal, Movement, Social, Rest, Medication, Other.
- Reduce typing by offering common IADL presets inside each tile.
- When a preset is selected, save it as the planned activity note so the entry has useful context.
- Treat the first user action as adding something to today's plan.
- Treat the later user action as confirmation that the planned activity happened.
- Show notes clearly on both the MCI and care partner dashboards.
- Use language like "confirm" and "mark" instead of "log" when the user is doing the action.

## SMS workflow after Twilio approval

1. Send a morning prompt to the MCI participant at 8:00 AM.
   Example: "Good morning. What is one thing you plan to do first today?"

2. Let the participant reply by SMS.
   The reply becomes the note on a simple activity entry.

3. Parse natural replies with AI.
   The parser only returns known Context categories and time buckets. Low-confidence items are dropped.

4. Save parsed items as planned activities.
   These appear on the dashboard as waiting for confirmation.

5. Send a re-entry cue after the participant's configured gap only if there is still a pending planned activity.
   Example: "A gentle reminder: you mentioned breakfast earlier. Tap here if you want to return to your day."

6. Let the participant confirm by tapping a link or replying by text.
   This should feel like confirmation, not homework.

7. Send the MCI participant and care partner a daily summary around 9:00 PM.
   Keep it short, warm, and factual.

## No-response logic

- If the MCI participant does not reply to the 8:00 AM plan text, send one gentle follow-up around 10:00 AM.
- If there is still no reply around noon, send a calm care partner notice.
- If the MCI participant replies later, Context still accepts the reply and creates the plan.
- The care partner notice should not sound urgent unless future safety logic explicitly requires that.

## Dashboard changes for the SMS stage

- MCI dashboard should show today's plan, including expected period: morning, afternoon, evening, or anytime.
- MCI dashboard should make one-tap confirmation the main action.
- Care partner dashboard should show whether today's planned items are waiting, done, later, or skipped.
- Care partner dashboard should show recent confirmations without sounding alarming.
- Both dashboards should keep the weekly activity view, but it should support the SMS-confirmed entries too.
- Reminder settings should control how often pending items are nudged, not how often logging is requested.

## Supabase changes for the SMS stage

- Add `sms_messages` for message prompts, replies, delivery status, and parsing metadata.
- Use the planned activities table as the place where AI-sorted SMS items are stored before confirmation.
- Store message direction: outbound or inbound.
- Store message purpose: morning_prompt, reentry_cue, confirmation, care_summary.
- Store delivery status from Twilio.
- Store consent and opt-out status for each phone number.
- Add a reminder schedule field per participant or household.

## Vercel changes for the SMS stage

- Add a Twilio inbound webhook route.
- Add a scheduled job for morning prompts.
- Add a scheduled job for morning no-response follow-up.
- Add a scheduled job for re-entry reminders.
- Add a scheduled job for daily care partner summaries.
- Keep `CRON_SECRET` set in Vercel for scheduled routes.

## Twilio changes for the SMS stage

- Finish A2P 10DLC approval.
- Connect the approved phone number to the campaign.
- Configure the inbound webhook URL in Twilio:
  `https://getcontextapp.com/api/twilio/inbound`
- Test STOP and HELP handling.
- Start with a low daily message cap during participant testing.

## What not to build yet

- Do not build a complex task manager.
- Do not build many custom categories.
- Do not add clinician workflows before testing participant and care partner behavior.
- Do not make the MCI user type long entries.
- Do not over-invest in automation integrations until interviews show which IADLs matter most.
