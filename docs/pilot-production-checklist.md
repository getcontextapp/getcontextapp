# Context Pilot Production Checklist

## Supabase phone uniqueness

Run `supabase-unique-profile-phone.sql` once in the Supabase production SQL Editor before adding pilot users.

Expected result:
- The duplicate-phone query returns no rows.
- The `profiles_phone_e164_unique` index exists.

Why it matters:
- One phone number should belong to one profile only.
- Inbound SMS matching can choose the wrong person if the same phone is saved on multiple profiles.

## Pilot analytics

Use Supabase `analytics_events` and `sms_messages` for the 2-week MVP pilot.

Core app events:
- `mci_dashboard_viewed`
- `care_partner_dashboard_viewed`
- `planned_activity_created`
- `planned_activity_confirmed`
- `planned_activity_reopened`
- `sms_completed_activity_parsed`
- `sms_plan_parsed`

Core SMS events:
- Events beginning with `sms_inbound_`
- Events beginning with `sms_outbound_`

Recommended pilot export fields:
- `profile_id`
- `household_id`
- `role`
- `event_name`
- `created_at`
- `properties`

For research reporting, de-identify exports before analysis.
