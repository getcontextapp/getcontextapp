# ContextRank recovery feature

## Change manifest

Created:
- `src/lib/context-rank.ts` - pure deterministic ContextRank engine.
- `src/lib/context-rank.test.ts` - focused engine tests.
- `src/lib/context-rank-adapter.ts` - Supabase row to evidence adapter.
- `src/app/api/recovery/route.ts` - starts a recovery session and returns a continuity card.
- `src/app/api/recovery/feedback/route.ts` - records confirm, reject, and correct feedback.
- `supabase/migration-recovery-tables.sql` - recovery session and moment tracking tables.

Modified:
- `src/app/mci-user/MCIUserClient.tsx` - replaces the old recall entry point with the ContextRank recovery card.

Will not touch:
- Care partner companion view.
- Household linking.
- Activity logging behavior.
- SMS reminder and Twilio flows.
- Existing natural-language plan parser.
- Existing AI re-entry generation logic.
- Authentication and navigation.

## Config surface

The tunable priors live in `config` inside `src/lib/context-rank.ts`:
- `thresholds`: leading, options, weak clue.
- `episode`: assignment, merge, and max gap thresholds.
- `scoring`: temporal decay, shown penalty, tie epsilon.
- `exhaustion`: max shown candidates per session.
- `reliabilityWeights`: occurrence, semantic, and time weighting.
- `intentWindowsMs`: recovery windows by intent.
- `sourceDefaults`: occurrence strength and source reliability by evidence source.

The final ranking score is always:

```text
CR = Support * Rel * g * (1 - X)
```

The LLM does not rank, gate, or decide confidence.

## Run checks

```bash
npx tsx --test src/lib/context-rank.test.ts
npm test
env NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon-key SUPABASE_SERVICE_ROLE_KEY=dummy-service-key ANTHROPIC_API_KEY=dummy TWILIO_ACCOUNT_SID=dummy TWILIO_AUTH_TOKEN=dummy TWILIO_PHONE_NUMBER=+15555550100 NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build
```

## Data wiring

The server adapter maps:
- `activity_logs` to `activity_log`.
- `planned_activities` with confirmed status or timestamp to `task_done`.
- `planned_activities` still planned to `task_planned`.
- inbound `sms_messages` to `sms_response`.
- outbound `sms_messages` to `sms_ignored`.
- `reflections` to `reflection`.
- confirmed `recovery_session_moments` to `user_confirmation`.

Done time is treated as evidence that something was completed, not as exact proof of when it happened.
