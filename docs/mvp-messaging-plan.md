# Context MVP Messaging Plan

## MVP thesis

Context is not a diary app. The MVP should test whether gentle cues, simple confirmations, and care partner visibility help an older adult with MCI stay oriented during daily life.

## Webapp changes now

- Keep the main activity tiles as the primary structure: Morning, Meal, Movement, Social, Rest, Medication, Other.
- Reduce typing by offering common IADL presets inside each tile.
- When a preset is selected, save it as the activity note so the log has useful context.
- Show notes clearly on both the MCI and care partner dashboards.
- Use language like "confirm" and "mark" instead of "log" when the user is doing the action.

## SMS workflow after Twilio approval

1. Send a morning prompt to the MCI participant.
   Example: "Good morning. What is one thing you plan to do first today?"

2. Let the participant reply by SMS.
   The reply becomes the note on a simple activity entry.

3. Send a re-entry cue after a configured gap.
   Example: "A gentle reminder: you mentioned breakfast earlier. Tap here if you want to return to your day."

4. Let the participant confirm by tapping a link or replying by text.
   This should feel like confirmation, not homework.

5. Send the care partner a daily summary.
   Keep it short, warm, and factual.

## Dashboard changes for the SMS stage

- MCI dashboard should show the latest cue and the next gentle reminder.
- MCI dashboard should make one-tap confirmation the main action.
- Care partner dashboard should show whether the participant responded to today’s prompt.
- Care partner dashboard should show recent confirmations and missed cues without sounding alarming.
- Both dashboards should keep the weekly activity view, but it should support the SMS-confirmed entries too.

## Supabase changes for the SMS stage

- Add a table for message prompts and replies.
- Store message direction: outbound or inbound.
- Store message purpose: morning_prompt, reentry_cue, confirmation, care_summary.
- Store delivery status from Twilio.
- Store consent and opt-out status for each phone number.
- Add a reminder schedule field per participant or household.

## Vercel changes for the SMS stage

- Add a Twilio inbound webhook route.
- Add a scheduled job for morning prompts.
- Add a scheduled job for re-entry reminders.
- Add a scheduled job for daily care partner summaries.
- Keep `CRON_SECRET` set in Vercel for scheduled routes.

## Twilio changes for the SMS stage

- Finish A2P 10DLC approval.
- Connect the approved phone number to the campaign.
- Configure the inbound webhook URL in Twilio.
- Test STOP and HELP handling.
- Start with a low daily message cap during participant testing.

## What not to build yet

- Do not build a complex task manager.
- Do not build many custom categories.
- Do not add clinician workflows before testing participant and care partner behavior.
- Do not make the MCI user type long entries.
- Do not over-invest in automation integrations until interviews show which IADLs matter most.

