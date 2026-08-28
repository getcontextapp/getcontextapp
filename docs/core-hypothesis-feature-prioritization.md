# Context core hypothesis and feature-prioritization baseline

Last updated: August 27, 2026

## Core hypothesis

For a dyad living with MCI, can Context make plans, recent actions, and next steps easy to capture and retrieve—then provide proportionate care-partner support—so the participant can recover dropped threads more independently, with less care-partner burden and without added cognitive overload?

## Testable sub-hypotheses

1. **Capture:** Can important context be recorded with little effort?
2. **Retrieval:** Can Context return the correct cue when someone loses their thread?
3. **Execution:** Can gentle nudges help the person begin, continue, and complete plans?
4. **Dyad coordination:** Can shared information replace repeated care-partner prompting?
5. **Trust and usability:** Will participants consistently use and trust the experience?
6. **Outcome and value:** Does Context reduce dependence, and will dyads pay for the basic loop?

## Product principle

Prioritize capture, retrieval, dyad interaction, and measurement before nice-to-have integrations.

The immediate product loop is:

> Capture → lose a thread → retrieve the right cue → resume or request help → measure the outcome.

## Decreasing feature priority

Status definitions:

- **Present:** Working in the product now.
- **Partial:** Some capability exists, but the experience or measurement is incomplete.
- **Not built:** Discussed concept only.

| Rank | Feature or capability | Status | Hypothesis alignment | Reason for position |
|---:|---|---|---|---|
| 1 | Structured plan capture: task, event, time, period, and repetition | Present | Direct: Capture | Context cannot recover a thread that was never captured. |
| 2 | Low-effort capture through typing, natural language, and voice input | Partial | Direct: Capture | Determines whether participants can use Context without care-partner assistance. |
| 3 | “What was I doing?”, “What next?”, and “Did I finish?” recovery experience | Present, early | Direct: Retrieval | Clearest test of the dropped-thread hypothesis. |
| 4 | ContextRank retrieval of relevant plans, completed actions, and recent moments | Partial | Direct: Retrieval | Tests whether Context can provide the correct cue instead of merely displaying a list. |
| 5 | Recovery and outcome measurement | Partial | Direct: Measurement | Must establish whether a cue helped someone resume without care-partner help. |
| 6 | Shared household state and care-partner dashboard | Present, partial | Direct: Dyad | Gives both partners one dependable source of truth. |
| 7 | Task states: Done, Later, skipped, moved, edited, and repeated | Present | Direct: Capture/Retrieval | Accurate state prevents obsolete or misleading recovery cues. |
| 8 | Natural, stateful conversational nudging | Partial | Direct: Execution | Should understand stages such as preparing, ready, started, and completed. |
| 9 | Simple nudge responses: Done, More time, Need help, and Not today | Partial | Direct: Execution/Measurement | Turns reminders into measurable interactions. |
| 10 | Care-partner-created plans and gentle remote check-ins | Not fully built | Direct: Dyad | Could reduce repeated calls while preserving autonomy. |
| 11 | Today view: date, time, planned next, and done earlier | Present, partial | Direct: Retrieval/Orientation | Supports independent orientation and recovery. |
| 12 | Exact-time push and SMS reminders | Present | Direct: Execution | Provides the baseline for testing reminder effectiveness. |
| 13 | ContextRank nudges for untimed tasks, including push | Partial; untimed push missing | Direct: Execution | Important, but must avoid arbitrary or excessive interruptions. |
| 14 | Notification acknowledgement and escalation after no response | Not fully built | Direct: Dyad/Measurement | Distinguishes not seen from seen but incomplete. |
| 15 | Calm interface, passwordless access, and notification controls | Present, partial | Enabler: Trust/Usability | Poor usability could invalidate the core test. |
| 16 | Activity history, daily reflections, and notification history | Present, partial | Supporting: Retrieval | Could reconstruct context, but actual retrieval value must be tested. |
| 17 | Guided multistep routines such as dress, pack, leave, and arrive | Not built | Supporting: Execution | Promising, but requires more interview evidence. |
| 18 | Calendar synchronization | Partial/flagged | Supporting: Capture | Reduces duplicate entry, but the basic capture loop should work without it. |
| 19 | Weekly summaries and care-partner daily SMS summaries | Present | Supporting: Dyad/Measurement | Supports awareness but is less central than real-time recovery. |
| 20 | Personalized spoken reminders and voice conversation | Voice input only | Supporting: Access | Validate nudge content before investing in spoken delivery. |
| 21 | Medication-specific tracking and adherence confirmation | Generic tasks only | Adjacent use case | Important, but safety and device integration expand the scope. |
| 22 | Temporary quiet/public mode and sensitive-content controls | Partial | Enabler: Trust | Becomes increasingly important with richer and location-aware nudging. |
| 23 | Gym barcode or pass appearing at the gym | Not built | Nice-to-have integration | Strong concept from one dyad; prototype before generalizing. |
| 24 | Grocery-arrival card with plan and shopping list | Not built | Nice-to-have integration | Demonstrates Context OS, but is not required to test the core loop. |
| 25 | Automatic geolocation detection of activities and completion | Not built | Future Context OS | Technically and privacy-complex; premature before validating manual context. |
| 26 | Siri, App Intents, Android actions, and native widgets | Not built | Future distribution | Improves access but does not establish Context’s underlying value. |
| 27 | Unified iADL integrations: health, transport, shopping, passes, and wearables | Not built | Long-term Context OS | Risks building an integration platform before proving the core loop. |
| 28 | Printable or physical daily plan | Not built | Possible accessibility option | Requires more recurring interview evidence. |
| 29 | General profile settings, admin signup alerts, and operational polish | Mostly present | Operational | Useful, but provides little direct evidence for the core hypothesis. |

## Near-term product emphasis

Focus on ranks 3–10:

- Make recovery easier to discover and use.
- Connect conversational nudges to task states.
- Add simple response choices.
- Record whether the participant resumed independently or needed care-partner help.
- Measure changes in repeated care-partner prompting.
- Test whether dyads will pay for the basic product loop.

## Prioritization method

This ordering is based on hypothesis alignment, not a final RICE score.

- Continue collecting and coding interview evidence now.
- Create the first provisional RICE assessment after approximately 5–6 dyad interviews.
- Recalculate it after approximately 8–12 interviews for roadmap decisions.
- Apply safety, privacy, cognitive burden, and strategic alignment as gates outside the RICE score.
- A feature with high estimated reach but weak connection to capture, recovery, dyad independence, or measurement should remain below a core-hypothesis feature.
